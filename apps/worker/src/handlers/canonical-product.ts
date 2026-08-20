import { createHash } from "node:crypto";
import {
  composeJacomoCanonicalCreative,
  type JacomoCreativeOutput,
} from "../../../../packages/core/src/modules/campaign/jacomo-workflow.js";
import { parseCreativeDocument, type CreativeDocument } from "../../../../packages/core/src/modules/creative/creative-document.js";
import type {
  CampaignAssetPoolSelectionRecord,
  CampaignRepositories,
} from "../../../../packages/core/src/modules/campaign/repositories.js";
import type { AssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import type { CreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import type { ObjectStorage } from "../../../../packages/infrastructure/src/storage/s3-object-storage.js";
import {
  createCanonicalRendererAdapter,
} from "../../../../packages/infrastructure/src/render/canonical-renderer-adapter.js";
import type { CanonicalRendererResult } from "../../../../packages/infrastructure/src/render/canonical-renderer-port.js";
import {
  createPlumeRendererAssetResolver,
  type RendererAssetTokenBinding,
} from "../../../../packages/infrastructure/src/render/renderer-asset-resolver.js";
import { resolveCanonicalRendererBinding } from "../../../../packages/infrastructure/src/render/renderer-bindings.js";
import { PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID } from "../../../../packages/infrastructure/src/render/renderer-bindings.js";

export interface CanonicalProductDependencies {
  readonly campaignRepositories: CampaignRepositories;
  readonly assetRepositories: AssetRepositories;
  readonly creativeRepositories: CreativeRepositories;
  readonly fileObjectReader: {
    getFileObject(workspaceId: string, fileObjectId: string): Promise<FileObjectRecord | null>;
  };
  readonly storage: ObjectStorage;
}

export interface CanonicalCopy {
  readonly advertiser: string;
  readonly headline: string;
  readonly subcopy: string;
}

export interface CanonicalAssetContext {
  readonly assetVersionId: string;
  readonly fileObjectId: string;
  readonly objectKey: string;
  readonly mimeType: "image/png";
  readonly checksumSha256: string;
  readonly bytes: Uint8Array;
  readonly token: string;
}

export interface CanonicalRenderContext {
  readonly result: CanonicalRendererResult;
  readonly request: {
    readonly advertiser: string;
    readonly headline: string;
    readonly subcopy: string;
    readonly assetVersionId: string;
    readonly fileObjectId: string;
    readonly token: string;
  };
  readonly asset: CanonicalAssetContext;
}

function canonicalError(code: string, message = code): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 422, retryable: false });
  return error;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableAssetToken(workspaceId: string, assetVersionId: string, fileObjectId: string): string {
  return createHash("sha256")
    .update(`${workspaceId}\u0000${assetVersionId}\u0000${fileObjectId}`)
    .digest("hex");
}

function isPngWithAlpha(bytes: Uint8Array): boolean {
  // PNG signature + IHDR color type. 4 = grayscale+alpha, 6 = RGBA.
  return (
    bytes.length >= 26 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52 &&
    (bytes[25] === 4 || bytes[25] === 6)
  );
}

function isRgbaPng(bytes: Uint8Array): boolean {
  return bytes.length >= 26 && bytes[25] === 6;
}

export async function readConfirmedCanonicalCopy(
  dependencies: Pick<CanonicalProductDependencies, "campaignRepositories">,
  workspaceId: string,
  campaignId: string,
  briefVersionId: string,
): Promise<CanonicalCopy> {
  const brief = await dependencies.campaignRepositories.getBrief(workspaceId, campaignId);
  const version = await dependencies.campaignRepositories.getBriefVersion(workspaceId, briefVersionId);
  if (
    !brief ||
    !version ||
    (version.campaignBriefId !== brief.id && version.campaignBriefId !== campaignId) ||
    brief.currentVersionId !== briefVersionId ||
    version.status !== "CONFIRMED"
  )
    throw canonicalError("CANONICAL_BRIEF_REQUIRED", "Canonical mode requires the confirmed brief version");
  const content = record(version.contentJson);
  const creativeCopy = record(content?.creativeCopy);
  const advertiser = requiredText(creativeCopy?.advertiser);
  const headline = requiredText(creativeCopy?.headline);
  const subcopy = requiredText(creativeCopy?.subcopy);
  if (!advertiser || !headline || !subcopy)
    throw canonicalError("CANONICAL_CREATIVE_COPY_REQUIRED", "Confirmed Brief creativeCopy is incomplete");
  return { advertiser, headline, subcopy };
}

export async function resolveCanonicalProductAsset(
  dependencies: CanonicalProductDependencies,
  workspaceId: string,
  campaignId: string,
  productId: string,
): Promise<CanonicalAssetContext> {
  let selections: readonly CampaignAssetPoolSelectionRecord[];
  try {
    selections = await dependencies.campaignRepositories.listAssetPoolSelections(
      workspaceId,
      campaignId,
      productId,
    );
  } catch {
    throw canonicalError("CANONICAL_PRODUCT_ASSET_REQUIRED", "A selected Product asset is required");
  }
  selections = selections.filter(
    (selection) =>
      selection.workspaceId === workspaceId &&
      selection.campaignId === campaignId &&
      selection.productId === productId &&
      selection.status === "SELECTED",
  );
  if (selections.length === 0)
    throw canonicalError("CANONICAL_PRODUCT_ASSET_REQUIRED", "A selected Product asset is required");
  if (selections.length !== 1)
    throw canonicalError("CANONICAL_PRODUCT_ASSET_AMBIGUOUS", "Exactly one selected Product asset is required");
  const selection = selections[0]!;
  if (selection.licenseStatus !== "VALID")
    throw canonicalError("CANONICAL_PRODUCT_ASSET_LICENSE_INVALID", "Selected Product asset license is not valid");

  const assetVersion = await dependencies.assetRepositories.getVersion(workspaceId, selection.assetVersionId);
  if (!assetVersion || assetVersion.workspaceId !== workspaceId)
    throw canonicalError("CANONICAL_PRODUCT_ASSET_REQUIRED", "Selected AssetVersion is not available");
  const asset = await dependencies.assetRepositories.getAsset(workspaceId, assetVersion.designAssetId);
  if (!asset || asset.status !== "ACTIVE" || asset.licenseStatus !== "VALID")
    throw canonicalError("CANONICAL_PRODUCT_ASSET_LICENSE_INVALID", "Selected Product asset license is not valid");
  const file = await dependencies.fileObjectReader.getFileObject(workspaceId, assetVersion.fileObjectId);
  if (!file || file.workspaceId !== workspaceId)
    throw canonicalError("CANONICAL_PRODUCT_ASSET_REQUIRED", "Selected FileObject is not available");
  if (file.mimeType !== "image/png")
    throw canonicalError("CANONICAL_PRODUCT_ASSET_MIME_INVALID", "Object Right accepts PNG Product assets only");
  let bytes: Uint8Array;
  try {
    bytes = await dependencies.storage.get(file.objectKey);
  } catch {
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_STORAGE_MISSING",
      "Selected Product asset bytes are not available in object storage",
    );
  }
  const actualChecksum = checksum(bytes);
  if (actualChecksum !== file.checksumSha256)
    throw canonicalError("CANONICAL_PRODUCT_ASSET_CHECKSUM_MISMATCH", "Uploaded FileObject checksum changed");
  if (!isPngWithAlpha(bytes))
    throw canonicalError("CANONICAL_PRODUCT_ASSET_ALPHA_REQUIRED", "Object Right requires an alpha-enabled PNG");
  return {
    assetVersionId: assetVersion.id,
    fileObjectId: file.id,
    objectKey: file.objectKey,
    mimeType: "image/png",
    checksumSha256: file.checksumSha256,
    bytes,
    token: stableAssetToken(workspaceId, assetVersion.id, file.id),
  };
}

export function resolveCanonicalFormatProfileId(
  requested: string,
  selections: readonly { readonly id: string; readonly formatProfileId: string; readonly status: string }[] = [],
): string {
  if (requested === PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID) return requested;
  const selection = selections.find(
    (item) => item.status === "SELECTED" && (item.id === requested || item.formatProfileId === requested),
  );
  const profileId = selection?.formatProfileId ?? requested;
  resolveCanonicalRendererBinding(profileId);
  return profileId;
}

export async function composeCanonicalProductCreative(
  dependencies: CanonicalProductDependencies,
  input: {
    readonly workspaceId: string;
    readonly campaignId: string;
    readonly productId: string;
    readonly briefVersionId: string;
    readonly formatProfileId: string;
    readonly sequence: number;
    readonly jobId: string;
  },
): Promise<{ readonly creative: JacomoCreativeOutput; readonly copy: CanonicalCopy; readonly asset: CanonicalAssetContext }> {
  const copy = await readConfirmedCanonicalCopy(
    dependencies,
    input.workspaceId,
    input.campaignId,
    input.briefVersionId,
  );
  const asset = await resolveCanonicalProductAsset(
    dependencies,
    input.workspaceId,
    input.campaignId,
    input.productId,
  );
  const selections = await dependencies.campaignRepositories.listFormatSelections(
    input.workspaceId,
    input.campaignId,
  );
  const formatProfileId = resolveCanonicalFormatProfileId(input.formatProfileId, selections);
  const creativeId = stableUuid(`${input.jobId}:creative:${input.productId}:${formatProfileId}`);
  const creativeVersionId = stableUuid(`${input.jobId}:creative-version:${input.productId}:${formatProfileId}`);
  const creativeSetId = stableUuid(`${input.jobId}:creative-set`);
  const existingSet = await dependencies.creativeRepositories.getCreativeSet(input.workspaceId, creativeSetId);
  if (!existingSet)
    await dependencies.creativeRepositories.createCreativeSet({
      id: creativeSetId,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      name: "JACOMO Canonical Product",
      generationRequestId: input.jobId,
      status: "GENERATING",
    });
  const existingCreative = await dependencies.creativeRepositories.getCreative(input.workspaceId, creativeId);
  if (!existingCreative)
    await dependencies.creativeRepositories.createCreative({
      id: creativeId,
      workspaceId: input.workspaceId,
      creativeSetId,
      campaignId: input.campaignId,
      productId: input.productId,
      campaignFormatSelectionId: formatProfileId,
      status: "GENERATING",
    });
  const existingVersion = await dependencies.creativeRepositories.getVersion(
    input.workspaceId,
    creativeVersionId,
  );
  if (existingVersion)
    return { creative: { creativeId, creativeVersionId, document: existingVersion.documentJson, outputProfile: { mimeType: "image/png", width: 1029, height: 258, transparentBackground: false } }, copy, asset };
  const creative = composeJacomoCanonicalCreative({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    productId: input.productId,
    formatProfileId,
    sequence: input.sequence,
    briefVersionId: input.briefVersionId,
    assetVersionId: asset.assetVersionId,
    advertiser: copy.advertiser,
    headline: copy.headline,
    subcopy: copy.subcopy,
    creativeId,
    creativeVersionId,
  });
  await dependencies.creativeRepositories.createVersion({
    id: creative.creativeVersionId,
    workspaceId: input.workspaceId,
    creativeId: creative.creativeId,
    formatProfileId: creative.document.formatProfileId,
    layoutTemplateId: creative.document.layoutTemplateId ?? null,
    briefVersionId: input.briefVersionId,
    documentJson: creative.document,
    copyAssetsJson: creative.document.copyAssets,
    generationMetadataJson: {
      stage: "COMPOSED",
      renderMode: "CANONICAL_RENDERER",
      source: "CONFIRMED_BRIEF_AND_SELECTED_ASSET",
      assetVersionId: asset.assetVersionId,
    },
  });
  await dependencies.creativeRepositories.addAssetUsages([
    {
      workspaceId: input.workspaceId,
      creativeVersionId: creative.creativeVersionId,
      assetVersionId: asset.assetVersionId,
      elementId: creative.document.elements.find((element) => element.type === "IMAGE")?.id ?? null,
      usageType: "IMAGE",
      transformJson: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    },
  ]);
  return { creative, copy, asset };
}

export async function renderCanonicalProductDocument(
  dependencies: CanonicalProductDependencies,
  workspaceId: string,
  documentInput: unknown,
  requestId: string,
): Promise<CanonicalRenderContext> {
  const document = parseCreativeDocument(documentInput);
  if (document.metadata.renderMode !== "CANONICAL_RENDERER")
    throw canonicalError("CANONICAL_RENDER_MODE_REQUIRED", "Canonical renderer requires an explicit renderMode marker");
  const campaignId = requiredText(document.metadata.campaignId);
  const productId = requiredText(document.metadata.productId);
  const copyAssets = record(document.copyAssets);
  const advertiser = requiredText(copyAssets?.advertiser);
  const headline = requiredText(copyAssets?.headline);
  const subcopy = requiredText(copyAssets?.subcopy);
  const image = document.elements.find((element) => element.type === "IMAGE");
  const assetVersionId = image?.assetVersionId;
  if (!campaignId || !productId || !advertiser || !headline || !subcopy || !assetVersionId)
    throw canonicalError("CANONICAL_CREATIVE_DOCUMENT_INVALID", "Canonical CreativeDocument is incomplete");
  const asset = await resolveCanonicalProductAsset(dependencies, workspaceId, campaignId, productId);
  if (asset.assetVersionId !== assetVersionId)
    throw canonicalError("CANONICAL_ASSET_REFERENCE_MISMATCH", "CreativeDocument asset does not match selected Product asset");
  const resolverBinding: RendererAssetTokenBinding = {
    token: asset.token,
    workspaceId,
    fileObjectId: asset.fileObjectId,
    objectKey: asset.objectKey,
    mimeType: asset.mimeType,
  };
  const resolver = createPlumeRendererAssetResolver({ workspaceId, storage: dependencies.storage, bindings: [resolverBinding] });
  const adapter = createCanonicalRendererAdapter({ workspaceId, assetResolver: resolver });
  const result = await adapter.render({
    requestId,
    workspaceId,
    plumeFormatProfileId: document.formatProfileId,
    advertiser,
    headline,
    subcopy,
    productAsset: {
      token: asset.token,
      mimeType: asset.mimeType,
      checksumSha256: asset.checksumSha256,
    },
  });
  return {
    result,
    request: { advertiser, headline, subcopy, assetVersionId, fileObjectId: asset.fileObjectId, token: asset.token },
    asset,
  };
}

export function pngIsRgba(bytes: Uint8Array): boolean {
  return isRgbaPng(bytes);
}

function stableUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
