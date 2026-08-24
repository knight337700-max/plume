import { createHash } from "node:crypto";
import {
  composeJacomoCanonicalCreative,
  type JacomoCreativeOutput,
} from "../../../../packages/core/src/modules/campaign/jacomo-workflow.js";
import {
  parseCreativeDocument,
  type CreativeDocument,
} from "../../../../packages/core/src/modules/creative/creative-document.js";
import type {
  CampaignAssetPoolSelectionRecord,
  CampaignRepositories,
} from "../../../../packages/core/src/modules/campaign/repositories.js";
import type { ClientBrandRepositories } from "../../../../packages/core/src/modules/client-brand/repositories.js";
import type { AgentProviderGateway } from "../../../../packages/core/src/agents/orchestrator.js";
import type { AgentOrchestrator } from "../../../../packages/core/src/agents/orchestrator.js";
import type { AssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import type { CreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import type { ObjectStorage } from "../../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createCanonicalRendererAdapter } from "../../../../packages/infrastructure/src/render/canonical-renderer-adapter.js";
import type { CanonicalRendererResult } from "../../../../packages/infrastructure/src/render/canonical-renderer-port.js";
import {
  createPlumeRendererAssetResolver,
  type RendererAssetTokenBinding,
} from "../../../../packages/infrastructure/src/render/renderer-asset-resolver.js";
import {
  PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,
  THUMBNAIL_BOX_RIGHT_FORMAT_BINDING,
  type CanonicalRendererBinding,
  resolveCanonicalRendererBinding,
} from "../../../../packages/infrastructure/src/render/renderer-bindings.js";
import { planSemanticPlacement } from "../../../../packages/infrastructure/src/render/semantic-placement-planner.js";
import {
  createSemanticPlacementEvidence,
  semanticPlacementTargetFromBinding,
  validateSemanticPlacementEvidence,
  type SemanticPlacementEvidence,
  type SemanticPlacementSourceEvidence,
} from "../../../../packages/infrastructure/src/render/semantic-placement-evidence.js";
import { inspectImageBytes } from "../../../../packages/renderer-vendor/src/public.js";
import {
  createFreeformLayoutPlannerHandler,
  type FreeformPlannerSelectedAsset,
} from "./ai/plan-freeform-layout.js";
import { assertCompleted } from "./ai/index.js";
import {
  createFreeformCanonicalDocument,
} from "./freeform-canonical-document.js";
import {
  createFreeformLayoutEvidence,
  FREEFORM_PLUME_FORMAT_PROFILE_ID,
  getKakaoDisplayNative21FormatProfile,
  validateFreeformLayoutEvidence,
  type FreeformLayoutEvidenceMetadata,
} from "../../../../packages/infrastructure/src/render/freeform-layout-contract.js";
import {
  getRendererRuntimeRoot,
  loadFreeformFontRegistry,
} from "../../../../packages/renderer-vendor/src/public.js";

export interface CanonicalProductDependencies {
  readonly campaignRepositories: CampaignRepositories;
  readonly assetRepositories: AssetRepositories;
  readonly creativeRepositories: CreativeRepositories;
  readonly fileObjectReader: {
    getFileObject(workspaceId: string, fileObjectId: string): Promise<FileObjectRecord | null>;
  };
  readonly storage: ObjectStorage;
  readonly providerGateway?: AgentProviderGateway;
  readonly agentOrchestrator?: AgentOrchestrator;
  readonly clientBrandRepositories?: ClientBrandRepositories;
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
  readonly mimeType: "image/png" | "image/jpeg";
  readonly checksumSha256: string;
  readonly bytes: Uint8Array;
  readonly token: string;
  readonly width: number;
  readonly height: number;
  readonly exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly hasAlpha: boolean;
  readonly productName?: string;
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
  readonly document: CreativeDocument;
}

function canonicalError(code: string, message = code): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 422, retryable: false });
  return error;
}

function freeformEvidenceError(cause: unknown): Error {
  const error = canonicalError(
    "CANONICAL_FREEFORM_LAYOUT_EVIDENCE_INVALID",
    "Persisted FREEFORM layout evidence is invalid",
  );
  const causeCode =
    cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : cause instanceof Error
        ? cause.message
        : "FREEFORM_LAYOUT_EVIDENCE_INVALID";
  Object.assign(error, { causeCode });
  return error;
}

function freeformProfile(): ReturnType<typeof getKakaoDisplayNative21FormatProfile> {
  return getKakaoDisplayNative21FormatProfile();
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

function stableAssetToken(
  workspaceId: string,
  assetVersionId: string,
  fileObjectId: string,
): string {
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
  const version = await dependencies.campaignRepositories.getBriefVersion(
    workspaceId,
    briefVersionId,
  );
  if (
    !brief ||
    !version ||
    (version.campaignBriefId !== brief.id && version.campaignBriefId !== campaignId) ||
    brief.currentVersionId !== briefVersionId ||
    version.status !== "CONFIRMED"
  )
    throw canonicalError(
      "CANONICAL_BRIEF_REQUIRED",
      "Canonical mode requires the confirmed brief version",
    );
  const content = record(version.contentJson);
  const creativeCopy = record(content?.creativeCopy);
  const advertiser = requiredText(creativeCopy?.advertiser);
  const headline = requiredText(creativeCopy?.headline);
  const subcopy = requiredText(creativeCopy?.subcopy);
  if (!advertiser || !headline || !subcopy)
    throw canonicalError(
      "CANONICAL_CREATIVE_COPY_REQUIRED",
      "Confirmed Brief creativeCopy is incomplete",
    );
  return { advertiser, headline, subcopy };
}

export async function resolveCanonicalProductAsset(
  dependencies: CanonicalProductDependencies,
  workspaceId: string,
  campaignId: string,
  productId: string,
  plumeFormatProfileId: string = PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,
): Promise<CanonicalAssetContext> {
  const binding = resolveCanonicalRendererBinding(plumeFormatProfileId);
  const isThumbnail =
    binding.plumeFormatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.plumeFormatProfileId;
  const isFreeform = binding.layoutMode === "FREEFORM";
  let selections: readonly CampaignAssetPoolSelectionRecord[];
  try {
    selections = await dependencies.campaignRepositories.listAssetPoolSelections(
      workspaceId,
      campaignId,
      productId,
    );
  } catch {
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_REQUIRED",
      "A selected Product asset is required",
    );
  }
  selections = selections.filter(
    (selection) =>
      selection.workspaceId === workspaceId &&
      selection.campaignId === campaignId &&
      selection.productId === productId &&
      selection.status === "SELECTED",
  );
  if (selections.length === 0)
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_REQUIRED",
      "A selected Product asset is required",
    );
  if (selections.length !== 1)
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_AMBIGUOUS",
      "Exactly one selected Product asset is required",
    );
  const selection = selections[0]!;
  if (selection.licenseStatus !== "VALID")
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_LICENSE_INVALID",
      "Selected Product asset license is not valid",
    );

  const assetVersion = await dependencies.assetRepositories.getVersion(
    workspaceId,
    selection.assetVersionId,
  );
  if (!assetVersion || assetVersion.workspaceId !== workspaceId)
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_REQUIRED",
      "Selected AssetVersion is not available",
    );
  const asset = await dependencies.assetRepositories.getAsset(
    workspaceId,
    assetVersion.designAssetId,
  );
  if (!asset || asset.status !== "ACTIVE" || asset.licenseStatus !== "VALID")
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_LICENSE_INVALID",
      "Selected Product asset license is not valid",
    );
  const file = await dependencies.fileObjectReader.getFileObject(
    workspaceId,
    assetVersion.fileObjectId,
  );
  if (!file || file.workspaceId !== workspaceId)
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_REQUIRED",
      "Selected FileObject is not available",
    );
  if (
    (isThumbnail && file.mimeType !== "image/png" && file.mimeType !== "image/jpeg") ||
    (!isThumbnail && !isFreeform && file.mimeType !== "image/png") ||
    (isFreeform && file.mimeType !== "image/png" && file.mimeType !== "image/jpeg")
  )
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_MIME_INVALID",
      isThumbnail
        ? "Thumbnail accepts PNG or JPEG Product assets only"
        : isFreeform
          ? "FREEFORM accepts PNG or JPEG Product assets only"
          : "Object Right accepts PNG Product assets only",
    );
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
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_CHECKSUM_MISMATCH",
      "Uploaded FileObject checksum changed",
    );
  let inspected: Awaited<ReturnType<typeof inspectImageBytes>>;
  try {
    inspected = await inspectImageBytes(bytes);
  } catch {
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_IMAGE_INVALID",
      "Selected Product image cannot be decoded",
    );
  }
  if (inspected.detectedMimeType !== file.mimeType)
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_MIME_MISMATCH",
      "Uploaded image MIME does not match its declaration",
    );
  if (!isThumbnail && !isFreeform && (!isPngWithAlpha(bytes) || !inspected.hasAlpha))
    throw canonicalError(
      "CANONICAL_PRODUCT_ASSET_ALPHA_REQUIRED",
      "Object Right requires an alpha-enabled PNG",
    );
  const product = await dependencies.clientBrandRepositories?.getProduct(workspaceId, productId);
  return {
    assetVersionId: assetVersion.id,
    fileObjectId: file.id,
    objectKey: file.objectKey,
    mimeType: inspected.detectedMimeType,
    checksumSha256: file.checksumSha256,
    bytes,
    token: stableAssetToken(workspaceId, assetVersion.id, file.id),
    width: inspected.width,
    height: inspected.height,
    exifOrientation: inspected.exifOrientation,
    hasAlpha: inspected.hasAlpha,
    ...(product?.name ? { productName: product.name } : {}),
  };
}

export async function resolveCanonicalProductContext(
  dependencies: CanonicalProductDependencies,
  workspaceId: string,
  campaignId: string,
  productId: string,
  plumeFormatProfileId: string,
): Promise<{
  readonly binding: CanonicalRendererBinding;
  readonly asset: CanonicalAssetContext;
}> {
  const binding = resolveCanonicalRendererBinding(plumeFormatProfileId);
  const asset = await resolveCanonicalProductAsset(
    dependencies,
    workspaceId,
    campaignId,
    productId,
    binding.plumeFormatProfileId,
  );
  return { binding, asset };
}

export function resolveCanonicalFormatProfileId(
  requested: string,
  selections: readonly {
    readonly id: string;
    readonly formatProfileId: string;
    readonly status: string;
  }[] = [],
): string {
  if (requested === PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID) return requested;
  const selection = selections.find(
    (item) =>
      item.status === "SELECTED" && (item.id === requested || item.formatProfileId === requested),
  );
  const profileId = selection?.formatProfileId ?? requested;
  resolveCanonicalRendererBinding(profileId);
  return profileId;
}

function validatePersistedFreeformVersion(
  version: {
    readonly id: string;
    readonly creativeId: string;
    readonly formatProfileId: string;
    readonly documentJson: CreativeDocument;
  },
  input: {
    readonly workspaceId: string;
    readonly campaignId: string;
    readonly productId: string;
    readonly creativeId: string;
    readonly copy: CanonicalCopy;
    readonly asset: CanonicalAssetContext;
    readonly profile: ReturnType<typeof getKakaoDisplayNative21FormatProfile>;
    readonly fontRegistry: ReturnType<typeof loadFreeformFontRegistry>;
    readonly payloadDocument?: CreativeDocument;
  },
): FreeformLayoutEvidenceMetadata {
  try {
    if (
      version.formatProfileId !== FREEFORM_PLUME_FORMAT_PROFILE_ID ||
      version.creativeId !== input.creativeId
    )
      throw new Error("FREEFORM_PERSISTED_IDENTITY_MISMATCH");
    const document = parseCreativeDocument(version.documentJson);
    const metadata = document.metadata;
    if (
      metadata.workspaceId !== input.workspaceId ||
      metadata.campaignId !== input.campaignId ||
      metadata.productId !== input.productId ||
      metadata.creativeId !== input.creativeId ||
      metadata.renderMode !== "CANONICAL_RENDERER" ||
      metadata.layoutMode !== "FREEFORM" ||
      document.formatProfileId !== FREEFORM_PLUME_FORMAT_PROFILE_ID
    )
      throw new Error("FREEFORM_PERSISTED_IDENTITY_MISMATCH");
    if (input.payloadDocument) {
      const payloadMetadata = input.payloadDocument.metadata;
      if (
        payloadMetadata.workspaceId !== metadata.workspaceId ||
        payloadMetadata.campaignId !== metadata.campaignId ||
        payloadMetadata.productId !== metadata.productId ||
        payloadMetadata.creativeId !== metadata.creativeId
      )
        throw new Error("FREEFORM_PAYLOAD_PERSISTED_IDENTITY_MISMATCH");
    }
    const evidence = validateFreeformLayoutEvidence(
      { freeformLayoutEvidence: metadata.freeformLayoutEvidence },
      {
        expectedRendererAssetId: input.asset.assetVersionId,
        confirmedCopy: { headline: input.copy.headline, subcopy: input.copy.subcopy },
        profile: input.profile,
        fontRegistry: input.fontRegistry,
      },
    );
    const plan = evidence.freeformLayoutEvidence.creativeLayoutPlan;
    const image = plan.elements.find((element) => element.type === "IMAGE");
    const copyAssets = record(document.copyAssets);
    if (
      !image ||
      image.assetId !== input.asset.assetVersionId ||
      document.usedAssetVersionIds.length !== 1 ||
      document.usedAssetVersionIds[0] !== input.asset.assetVersionId ||
      copyAssets?.advertiser !== input.copy.advertiser ||
      copyAssets?.headline !== input.copy.headline ||
      copyAssets?.subcopy !== input.copy.subcopy
    )
      throw new Error("FREEFORM_PERSISTED_CONTENT_MISMATCH");
    return evidence;
  } catch (error) {
    if ((error as { readonly code?: unknown })?.code === "CANONICAL_FREEFORM_LAYOUT_EVIDENCE_INVALID")
      throw error;
    throw freeformEvidenceError(error);
  }
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
): Promise<{
  readonly creative: JacomoCreativeOutput;
  readonly copy: CanonicalCopy;
  readonly asset: CanonicalAssetContext;
}> {
  const copy = await readConfirmedCanonicalCopy(
    dependencies,
    input.workspaceId,
    input.campaignId,
    input.briefVersionId,
  );
  const selections = await dependencies.campaignRepositories.listFormatSelections(
    input.workspaceId,
    input.campaignId,
  );
  const formatProfileId = resolveCanonicalFormatProfileId(input.formatProfileId, selections);
  const requestedBinding = resolveCanonicalRendererBinding(formatProfileId);
  if (requestedBinding.layoutMode === "FREEFORM" && !dependencies.agentOrchestrator)
    throw canonicalError(
      "CANONICAL_FREEFORM_LAYOUT_PLANNER_REQUIRED",
      "FREEFORM canonical generation requires the configured LAYOUT_PLANNER orchestrator",
    );
  const { binding, asset } = await resolveCanonicalProductContext(
    dependencies,
    input.workspaceId,
    input.campaignId,
    input.productId,
    formatProfileId,
  );
  const creativeId = stableUuid(`${input.jobId}:creative:${input.productId}:${formatProfileId}`);
  const creativeVersionId = stableUuid(
    `${input.jobId}:creative-version:${input.productId}:${formatProfileId}`,
  );
  const creativeSetId = stableUuid(`${input.jobId}:creative-set`);
  const existingSet = await dependencies.creativeRepositories.getCreativeSet(
    input.workspaceId,
    creativeSetId,
  );
  if (!existingSet)
    await dependencies.creativeRepositories.createCreativeSet({
      id: creativeSetId,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      name: "JACOMO Canonical Product",
      generationRequestId: input.jobId,
      status: "GENERATING",
    });
  const existingCreative = await dependencies.creativeRepositories.getCreative(
    input.workspaceId,
    creativeId,
  );
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
  if (existingVersion && binding.layoutMode === "TEMPLATE_LOCKED")
    return {
      creative: {
        creativeId,
        creativeVersionId,
        document: existingVersion.documentJson,
        outputProfile: {
          mimeType: "image/png",
          width: 1029,
          height: 258,
          transparentBackground: false,
        },
      },
      copy,
      asset,
    };
  if (existingVersion && binding.layoutMode === "FREEFORM") {
    const profile = freeformProfile();
    const fontRegistry = loadFreeformFontRegistry(getRendererRuntimeRoot());
    validatePersistedFreeformVersion(existingVersion, {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      productId: input.productId,
      creativeId,
      copy,
      asset,
      profile,
      fontRegistry,
    });
    return {
      creative: {
        creativeId,
        creativeVersionId,
        document: existingVersion.documentJson,
        outputProfile: {
          mimeType: "image/png",
          width: profile.canvas.width,
          height: profile.canvas.height,
          transparentBackground: false,
        },
      },
      copy,
      asset,
    };
  }
  if (binding.layoutMode === "FREEFORM") {
    const runtimeRoot = getRendererRuntimeRoot();
    const profile = freeformProfile();
    const fontRegistry = loadFreeformFontRegistry(runtimeRoot);
    const planner = createFreeformLayoutPlannerHandler({
      orchestrator: dependencies.agentOrchestrator!,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    const selectedAsset: FreeformPlannerSelectedAsset = {
      assetVersionId: asset.assetVersionId,
      rendererAssetId: asset.assetVersionId,
      mimeType: asset.mimeType,
      checksumSha256: asset.checksumSha256,
      width: asset.width,
      height: asset.height,
      imageInput: {
        fileId: asset.assetVersionId,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        checksumSha256: asset.checksumSha256,
      },
    };
    const plannerTaskId = `${input.jobId}:layout-planner:${input.productId}`;
    const planned = await planner({
      taskId: plannerTaskId,
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      creativeId,
      productId: input.productId,
      targetProfile: profile,
      confirmedCopy: { headline: copy.headline, subcopy: copy.subcopy },
      selectedAsset,
    });
    const plan = assertCompleted(planned.agentResult);
    const evidence = createFreeformLayoutEvidence(plan, {
      expectedRendererAssetId: asset.assetVersionId,
      confirmedCopy: { headline: copy.headline, subcopy: copy.subcopy },
      profile,
      fontRegistry,
    });
    const document = createFreeformCanonicalDocument({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      creativeId,
      productId: input.productId,
      briefVersionId: input.briefVersionId,
      assetVersionId: asset.assetVersionId,
      advertiser: copy.advertiser,
      confirmedCopy: { headline: copy.headline, subcopy: copy.subcopy },
      evidence,
      profile,
      fontRegistry,
    });
    const creative = {
      creativeId,
      creativeVersionId,
      document,
      outputProfile: {
        mimeType: "image/png" as const,
        width: profile.canvas.width,
        height: profile.canvas.height,
        transparentBackground: false,
      },
    };
    await dependencies.creativeRepositories.createVersion({
      id: creative.creativeVersionId,
      workspaceId: input.workspaceId,
      creativeId: creative.creativeId,
      formatProfileId: creative.document.formatProfileId,
      layoutTemplateId: null,
      briefVersionId: input.briefVersionId,
      documentJson: creative.document,
      copyAssetsJson: creative.document.copyAssets,
      generationMetadataJson: {
        stage: "COMPOSED",
        renderMode: "CANONICAL_RENDERER",
        source: "CONFIRMED_BRIEF_SELECTED_ASSET_AND_LAYOUT_PLANNER",
        assetVersionId: asset.assetVersionId,
        freeformLayoutPlanSha256: evidence.freeformLayoutEvidence.creativeLayoutPlanSha256,
        layoutPlannerTaskId: plannerTaskId,
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
  let semanticPlacement: SemanticPlacementEvidence | undefined;
  if (
    binding.layoutMode === "TEMPLATE_LOCKED" &&
    binding.plumeFormatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.plumeFormatProfileId
  ) {
    if (!dependencies.providerGateway)
      throw canonicalError(
        "CANONICAL_SEMANTIC_PROVIDER_REQUIRED",
        "Thumbnail canonical generation requires the configured Agent provider gateway",
      );
    const planner = await planSemanticPlacement(
      {
        taskId: `${input.jobId}:semantic:${input.productId}`,
        workspaceId: input.workspaceId,
        correlationId: input.jobId,
        creativeId,
        productId: input.productId,
        ...(asset.productName ? { productName: asset.productName } : {}),
        asset: {
          assetId: asset.assetVersionId,
          fileId: asset.fileObjectId,
          mimeType: asset.mimeType,
          bytes: asset.bytes,
          checksumSha256: asset.checksumSha256,
        },
        copy: { advertiser: copy.advertiser, headline: copy.headline, subcopy: copy.subcopy },
      },
      { gateway: dependencies.providerGateway },
    );
    const source: SemanticPlacementSourceEvidence = {
      assetVersionId: asset.assetVersionId,
      fileObjectId: asset.fileObjectId,
      checksumSha256: asset.checksumSha256,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      exifOrientation: asset.exifOrientation,
    };
    semanticPlacement = createSemanticPlacementEvidence({
      target: semanticPlacementTargetFromBinding(binding),
      source,
      planner,
    });
  }
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
    templateId: binding.rendererTemplateId,
    ...(semanticPlacement ? { metadata: { semanticPlacement } } : {}),
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
      ...(semanticPlacement
        ? { semanticPlacementEvidenceFingerprint: semanticPlacement.evidenceFingerprint }
        : {}),
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
  creativeVersionId?: string,
): Promise<CanonicalRenderContext> {
  const payloadDocument = parseCreativeDocument(documentInput);
  const payloadBinding = resolveCanonicalRendererBinding(payloadDocument.formatProfileId);
  let document = payloadDocument;
  let persistedVersion:
    | {
        readonly id: string;
        readonly creativeId: string;
        readonly formatProfileId: string;
        readonly documentJson: CreativeDocument;
      }
    | undefined;
  const persistedCandidate = creativeVersionId
    ? await dependencies.creativeRepositories.getVersion(workspaceId, creativeVersionId)
    : null;
  const persistedCandidateDocument = persistedCandidate
    ? parseCreativeDocument(persistedCandidate.documentJson)
    : undefined;
  const persistedCandidateBinding = persistedCandidateDocument
    ? resolveCanonicalRendererBinding(persistedCandidateDocument.formatProfileId)
    : undefined;
  const requiresPersistedFreeform =
    payloadBinding.layoutMode === "FREEFORM" ||
    persistedCandidateBinding?.layoutMode === "FREEFORM";
  if (requiresPersistedFreeform) {
    if (
      !creativeVersionId ||
      !persistedCandidate ||
      !persistedCandidateDocument ||
      persistedCandidateBinding?.layoutMode !== "FREEFORM"
    )
      throw canonicalError(
        "CANONICAL_FREEFORM_PERSISTED_VERSION_REQUIRED",
        "FREEFORM rendering requires a persisted CreativeVersion identity",
      );
    persistedVersion = persistedCandidate;
    document = persistedCandidateDocument;
    const campaignId = requiredText(document.metadata.campaignId);
    const productId = requiredText(document.metadata.productId);
    const copyAssets = record(document.copyAssets);
    const confirmed =
      campaignId && productId
        ? await readConfirmedCanonicalCopy(dependencies, workspaceId, campaignId, document.metadata.briefVersionId ?? "")
        : null;
    if (!confirmed)
      throw canonicalError(
        "CANONICAL_FREEFORM_PERSISTED_IDENTITY_MISMATCH",
        "Persisted FREEFORM CreativeVersion identity is incomplete",
      );
    if (
      payloadDocument.metadata.workspaceId !== document.metadata.workspaceId ||
      payloadDocument.metadata.campaignId !== document.metadata.campaignId ||
      payloadDocument.metadata.productId !== document.metadata.productId ||
      payloadDocument.metadata.creativeId !== document.metadata.creativeId ||
      copyAssets?.advertiser !== confirmed.advertiser ||
      copyAssets?.headline !== confirmed.headline ||
      copyAssets?.subcopy !== confirmed.subcopy
    )
      throw canonicalError(
        "CANONICAL_FREEFORM_PERSISTED_IDENTITY_MISMATCH",
        "FREEFORM render payload does not match the persisted CreativeVersion",
      );
  }
  if (document.metadata.renderMode !== "CANONICAL_RENDERER")
    throw canonicalError(
      "CANONICAL_RENDER_MODE_REQUIRED",
      "Canonical renderer requires an explicit renderMode marker",
    );
  const campaignId = requiredText(document.metadata.campaignId);
  const productId = requiredText(document.metadata.productId);
  const copyAssets = record(document.copyAssets);
  const advertiser = requiredText(copyAssets?.advertiser);
  const headline = requiredText(copyAssets?.headline);
  const subcopy = requiredText(copyAssets?.subcopy);
  const image = document.elements.find((element) => element.type === "IMAGE");
  const assetVersionId = image?.assetVersionId;
  if (!campaignId || !productId || !advertiser || !headline || !subcopy || !assetVersionId)
    throw canonicalError(
      "CANONICAL_CREATIVE_DOCUMENT_INVALID",
      "Canonical CreativeDocument is incomplete",
    );
  const { binding, asset } = await resolveCanonicalProductContext(
    dependencies,
    workspaceId,
    campaignId,
    productId,
    document.formatProfileId,
  );
  if (asset.assetVersionId !== assetVersionId)
    throw canonicalError(
      "CANONICAL_ASSET_REFERENCE_MISMATCH",
      "CreativeDocument asset does not match selected Product asset",
    );
  const resolverBinding: RendererAssetTokenBinding = {
    token: asset.token,
    workspaceId,
    fileObjectId: asset.fileObjectId,
    objectKey: asset.objectKey,
    mimeType: asset.mimeType,
  };
  const resolver = createPlumeRendererAssetResolver({
    workspaceId,
    storage: dependencies.storage,
    bindings: [resolverBinding],
  });
  const adapter = createCanonicalRendererAdapter({ workspaceId, assetResolver: resolver });
  let freeformEvidence: FreeformLayoutEvidenceMetadata | undefined;
  if (binding.layoutMode === "FREEFORM") {
    if (!persistedVersion)
      throw canonicalError(
        "CANONICAL_FREEFORM_PERSISTED_VERSION_REQUIRED",
        "FREEFORM rendering requires a persisted CreativeVersion identity",
      );
    freeformEvidence = validatePersistedFreeformVersion(persistedVersion, {
      workspaceId,
      campaignId,
      productId,
      creativeId: persistedVersion.creativeId,
      copy: { advertiser: advertiser!, headline: headline!, subcopy: subcopy! },
      asset,
      profile: freeformProfile(),
      fontRegistry: loadFreeformFontRegistry(getRendererRuntimeRoot()),
      payloadDocument,
    });
  }
  let semanticPlacement: SemanticPlacementEvidence | undefined;
  if (
    binding.layoutMode === "TEMPLATE_LOCKED" &&
    binding.plumeFormatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.plumeFormatProfileId
  ) {
    const rawEvidence = document.metadata.semanticPlacement;
    const source: SemanticPlacementSourceEvidence = {
      assetVersionId: asset.assetVersionId,
      fileObjectId: asset.fileObjectId,
      checksumSha256: asset.checksumSha256,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      exifOrientation: asset.exifOrientation,
    };
    semanticPlacement = validateSemanticPlacementEvidence(rawEvidence, {
      target: semanticPlacementTargetFromBinding(binding),
      source,
      assetId: asset.assetVersionId,
    });
  }
  const result = freeformEvidence
    ? await adapter.render({
        requestId,
        workspaceId,
        plumeFormatProfileId: document.formatProfileId,
        layoutMode: "FREEFORM",
        creativeLayoutPlan: freeformEvidence.freeformLayoutEvidence.creativeLayoutPlan,
        assets: [
          {
            assetId: asset.assetVersionId,
            token: asset.token,
            mimeType: asset.mimeType,
            checksumSha256: asset.checksumSha256,
            declaredWidth: asset.width,
            declaredHeight: asset.height,
          },
        ],
        output: { mimeType: "image/png", format: "PNG" },
      })
    : await adapter.render({
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
          declaredWidth: asset.width,
          declaredHeight: asset.height,
        },
        ...(semanticPlacement ? { semanticPlacement } : {}),
      });
  return {
    result,
    request: {
      advertiser,
      headline,
      subcopy,
      assetVersionId,
      fileObjectId: asset.fileObjectId,
      token: asset.token,
      ...(freeformEvidence
        ? {
            layoutMode: "FREEFORM" as const,
            creativeLayoutPlanSha256:
              freeformEvidence.freeformLayoutEvidence.creativeLayoutPlanSha256,
            rendererAssetId: asset.assetVersionId,
          }
        : {}),
    },
    asset,
    document,
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
