import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryAssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import { createInMemoryCampaignRepositories } from "../../../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryCreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import {
  composeCanonicalProductCreative,
  readConfirmedCanonicalCopy,
  renderCanonicalProductDocument,
  resolveCanonicalProductAsset,
  type CanonicalProductDependencies,
} from "./canonical-product.js";

const workspaceId = "00000000-0000-4000-8000-000000000101";
const campaignId = "00000000-0000-4000-8000-00000000010b";
const briefId = "00000000-0000-4000-8000-00000000010c";
const briefVersionId = "00000000-0000-4000-8000-00000000010d";
const productId = "00000000-0000-4000-8000-000000000121";
const assetId = "00000000-0000-4000-8000-000000000127";
const assetVersionId = "00000000-0000-4000-8000-00000000012a";
const fileObjectId = "00000000-0000-4000-8000-00000000012d";
const objectKey = `workspaces/${workspaceId}/uploads/product.png`;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function dependencies(overrides: {
  readonly copy?: Record<string, unknown>;
  readonly selection?: Record<string, unknown> | null;
  readonly file?: Record<string, unknown> | null;
  readonly bytes?: Uint8Array;
} = {}): Promise<{ deps: CanonicalProductDependencies; bytes: Uint8Array }> {
  const bytes =
    overrides.bytes ??
    new Uint8Array(
      await readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../packages/renderer-vendor/upstream/fixtures/valid/object-right__product__basic__pass.png",
        ),
      ),
    );
  const campaignRepositories = createInMemoryCampaignRepositories({
    campaigns: [{ id: campaignId, workspaceId, brandId: "brand-1", displayCode: "PI-1B", name: "PI-1B", objectiveCode: "SALES", status: "DRAFT", currentStep: "READY", revisionNo: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    briefs: [{ id: briefId, workspaceId, campaignId, currentVersionId: briefVersionId, revisionNo: 1 }],
    briefVersions: [{ id: briefVersionId, workspaceId, campaignBriefId: briefId, versionNo: 1, sourceKind: "MANUAL", contentJson: { creativeCopy: overrides.copy ?? { advertiser: "자코모", headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" } }, sourceCitationsJson: [], brandProfileSnapshotJson: {}, status: "CONFIRMED", createdAt: new Date().toISOString() }],
    assetPoolSelections: overrides.selection === null ? [] : [{ id: "00000000-0000-4000-8000-000000000201", workspaceId, campaignId, productId, assetVersionId, status: "SELECTED", licenseStatus: "VALID", ...(overrides.selection ?? {}), updatedAt: new Date().toISOString() }],
    formatSelections: [{ id: "00000000-0000-4000-8000-000000000202", workspaceId, campaignId, channelCode: "KAKAO_MOMENT", formatProfileId: "kakao-moment-bizboard-1029x258", profileVersion: "2026.1", status: "SELECTED", snapshotJson: {}, updatedAt: new Date().toISOString() }],
  });
  const assetRepositories = createInMemoryAssetRepositories({
    assets: [{ id: assetId, workspaceId, brandId: "brand-1", name: "Product", assetType: "IMAGE", status: "ACTIVE", licenseStatus: "VALID", analysisSummaryJson: {}, revisionNo: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    versions: [{ id: assetVersionId, workspaceId, designAssetId: assetId, versionNo: 1, fileObjectId, sourceType: "UPLOAD", analysisJson: { alpha: true }, createdAt: new Date().toISOString() }],
  });
  const file: FileObjectRecord = { id: fileObjectId, workspaceId, storageProvider: "S3", bucket: "test", objectKey, originalFilename: "product.png", mimeType: "image/png", bytes: bytes.byteLength, checksumSha256: sha256(bytes), metadataJson: { alpha: true }, createdAt: new Date().toISOString(), ...(overrides.file ?? {}) };
  const deps: CanonicalProductDependencies = {
    campaignRepositories,
    assetRepositories,
    creativeRepositories: createInMemoryCreativeRepositories(),
    fileObjectReader: {
      async getFileObject(requestWorkspace, requestFileId) {
        if (requestWorkspace !== workspaceId || requestFileId !== fileObjectId) return null;
        return file;
      },
    },
    storage: {
      createObjectKey: () => objectKey,
      async put(input) { return { bucket: "test", objectKey: input.objectKey ?? objectKey, bytes: input.body.byteLength, checksumSha256: sha256(input.body), etag: sha256(input.body) }; },
      async head() { return null; },
      async get(requestObjectKey) { if (requestObjectKey !== objectKey) throw new Error("OBJECT_NOT_FOUND"); return bytes; },
      async presign() { return { url: "https://storage.invalid", expiresAt: new Date().toISOString(), method: "GET" as const }; },
      async deleteTemp() {},
    },
  };
  return { deps, bytes };
}

describe("canonical Product composition and asset boundary", () => {
  it("uses confirmed copy and selected uploaded asset, then preserves renderer evidence", async () => {
    const { deps } = await dependencies();
    const composed = await composeCanonicalProductCreative(deps, { workspaceId, campaignId, productId, briefVersionId, formatProfileId: "kakao-moment-bizboard-1029x258", sequence: 1, jobId: "00000000-0000-4000-8000-000000000301" });
    expect(composed.creative.document.metadata.renderMode).toBe("CANONICAL_RENDERER");
    expect(composed.creative.document.copyAssets).toEqual({ advertiser: "자코모", headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" });
    expect(composed.creative.document.usedAssetVersionIds).toEqual([assetVersionId]);
    expect(composed.creative.document.elements.find((element) => element.type === "IMAGE")).toMatchObject({ assetVersionId, locked: true, visible: true });
    const rendered = await renderCanonicalProductDocument(deps, workspaceId, composed.creative.document, "00000000-0000-4000-8000-000000000302");
    expect(rendered.result.status).toBe("COMPLETED");
    if (rendered.result.status !== "COMPLETED") return;
    const output = rendered.result.renderMetadata.rendererIntegrationOutput;
    expect(output?.status).toBe("PASS");
    expect(output?.validation.errors).toHaveLength(0);
    expect(output?.appliedImagePlacements[0]).toMatchObject({ imageSlotId: "OBJECT_RIGHT_PRODUCT", alphaTrimApplied: true });
    expect(output?.requestFingerprint).toHaveLength(64);
  });

  it("fails closed for missing copy, selection, invalid MIME/alpha, workspace scope, and unknown format", async () => {
    await expect(readConfirmedCanonicalCopy((await dependencies({ copy: {} })).deps, workspaceId, campaignId, briefVersionId)).rejects.toMatchObject({ code: "CANONICAL_CREATIVE_COPY_REQUIRED" });
    await expect(resolveCanonicalProductAsset((await dependencies({ selection: null })).deps, workspaceId, campaignId, productId)).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_REQUIRED" });
    const jpeg = await dependencies({ file: { mimeType: "image/jpeg" } });
    await expect(resolveCanonicalProductAsset(jpeg.deps, workspaceId, campaignId, productId)).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_MIME_INVALID" });
    const rgbPng = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=", "base64"));
    const noAlpha = await dependencies({ bytes: rgbPng });
    await expect(resolveCanonicalProductAsset(noAlpha.deps, workspaceId, campaignId, productId)).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_ALPHA_REQUIRED" });
    const invalidLicense = await dependencies({ selection: { licenseStatus: "EXPIRED" } });
    await expect(resolveCanonicalProductAsset(invalidLicense.deps, workspaceId, campaignId, productId)).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_LICENSE_INVALID" });
    await expect(resolveCanonicalProductAsset((await dependencies()).deps, "workspace-other", campaignId, productId)).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_REQUIRED" });
    const unknown = await dependencies();
    await expect(composeCanonicalProductCreative(unknown.deps, { workspaceId, campaignId, productId, briefVersionId, formatProfileId: "unknown-format", sequence: 1, jobId: "00000000-0000-4000-8000-000000000303" })).rejects.toMatchObject({ code: "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND" });
  });

  it("keeps applied placement evidence different for different Product geometry", async () => {
    const first = await dependencies();
    const tallBytes = new Uint8Array(
      await readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../packages/infrastructure/src/render/__fixtures__/object-right-product-tall.png",
        ),
      ),
    );
    const second = await dependencies({ bytes: tallBytes });
    const [firstCreative, secondCreative] = await Promise.all([
      composeCanonicalProductCreative(first.deps, {
        workspaceId,
        campaignId,
        productId,
        briefVersionId,
        formatProfileId: "kakao-moment-bizboard-1029x258",
        sequence: 1,
        jobId: "00000000-0000-4000-8000-000000000304",
      }),
      composeCanonicalProductCreative(second.deps, {
        workspaceId,
        campaignId,
        productId,
        briefVersionId,
        formatProfileId: "kakao-moment-bizboard-1029x258",
        sequence: 1,
        jobId: "00000000-0000-4000-8000-000000000305",
      }),
    ]);
    const [firstRender, secondRender] = await Promise.all([
      renderCanonicalProductDocument(first.deps, workspaceId, firstCreative.creative.document, "00000000-0000-4000-8000-000000000306"),
      renderCanonicalProductDocument(second.deps, workspaceId, secondCreative.creative.document, "00000000-0000-4000-8000-000000000307"),
    ]);
    const firstPlacement = firstRender.result.status === "COMPLETED" ? firstRender.result.renderMetadata.rendererIntegrationOutput?.appliedImagePlacements[0] : undefined;
    const secondPlacement = secondRender.result.status === "COMPLETED" ? secondRender.result.renderMetadata.rendererIntegrationOutput?.appliedImagePlacements[0] : undefined;
    expect(firstPlacement).toBeDefined();
    expect(secondPlacement).toBeDefined();
    if (!firstPlacement || !secondPlacement) return;
    expect(firstPlacement.destinationRect).not.toEqual(secondPlacement.destinationRect);
    expect(firstPlacement.appliedScale).not.toBe(secondPlacement.appliedScale);
    expect(firstPlacement.resolvedSourceCropPixels).not.toEqual(secondPlacement.resolvedSourceCropPixels);
  });
});
