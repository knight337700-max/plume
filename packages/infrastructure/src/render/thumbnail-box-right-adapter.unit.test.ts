import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspectImageBytes,
  inspectThumbnailBoxRightTextRaster,
  validateThumbnailBoxRightText,
} from "@plume/renderer-vendor";
import { createCanonicalRendererAdapter } from "./canonical-renderer-adapter.js";
import { buildSemanticCropCandidate } from "./semantic-crop-candidate.js";
import { createSemanticPlacementEvidence } from "./semantic-placement-evidence.js";
import {
  THUMBNAIL_BOX_RIGHT_FORMAT_BINDING,
  PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
} from "./renderer-bindings.js";
import type { RendererAssetByteStore } from "./renderer-asset-resolver.js";
import { createPlumeRendererAssetResolver } from "./renderer-asset-resolver.js";

const workspaceId = "thumbnail-workspace";
const token = "thumbnail-token";
const objectKey = `workspaces/${workspaceId}/thumbnail.png`;

class MemoryStore implements RendererAssetByteStore {
  public constructor(private readonly bytes: Uint8Array) {}
  public async get(key: string): Promise<Uint8Array> {
    if (key !== objectKey) throw new Error("TEST_STORAGE_OBJECT_NOT_FOUND");
    return this.bytes.slice();
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function renderThumbnail(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
  copy: Readonly<{ headline?: string; subcopy?: string }> = {},
) {
  const metadata = await inspectImageBytes(bytes);
  const planner = buildSemanticCropCandidate({
    assetId: "asset-version-thumbnail",
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    primarySubjectBounds: { x: 0.15, y: 0.15, width: 0.1, height: 0.1 },
    semanticRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
    focalPoint: { x: 0.2, y: 0.2 },
    confidence: 0.9,
    rationale: "fixture product",
  });
  const evidence = createSemanticPlacementEvidence({
    target: {
      plumeFormatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
      rendererFormatProfileId: THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.rendererFormatProfileId,
      rendererTemplateId: THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.rendererTemplateId,
      imageSlotId: "IMAGE_PRIMARY",
    },
    source: {
      assetVersionId: "asset-version-thumbnail",
      fileObjectId: "file-thumbnail",
      checksumSha256: sha256(bytes),
      mimeType,
      width: metadata.width,
      height: metadata.height,
      exifOrientation: metadata.exifOrientation,
    },
    planner: {
      ...planner,
      agentOutput: {
        formatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
        semanticPlacement: {
          status: "FOUND",
          primarySubjectBounds: { x: 0.15, y: 0.15, width: 0.1, height: 0.1 },
          semanticRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
          focalPoint: { x: 0.2, y: 0.2 },
          confidence: 0.9,
        },
        rationale: "fixture product",
      },
    },
  });
  const resolver = createPlumeRendererAssetResolver({
    workspaceId,
    storage: new MemoryStore(bytes),
    bindings: [
      {
        token,
        workspaceId,
        fileObjectId: "file-thumbnail",
        objectKey,
        mimeType,
      },
    ],
  });
  const adapter = createCanonicalRendererAdapter({ workspaceId, assetResolver: resolver });
  return adapter.render({
    requestId: "thumbnail-render",
    workspaceId,
    plumeFormatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
    advertiser: "자코모",
    headline: copy.headline ?? "자코모 프리미엄 소파",
    subcopy: copy.subcopy ?? "거실을 바꾸는 선택",
    productAsset: {
      token,
      mimeType,
      checksumSha256: sha256(bytes),
      declaredWidth: metadata.width,
      declaredHeight: metadata.height,
    },
    semanticPlacement: evidence,
  });
}

describe("canonical Thumbnail Box Right adapter", () => {
  it("preflights the pinned Korean fonts and enforces the text/image contract", async () => {
    const valid = await validateThumbnailBoxRightText({
      headline: "자코모 프리미엄 소파",
      subcopy: "거실을 바꾸는 선택",
    });
    expect(valid.status).toBe("PASS");
    expect(valid.fontDigests).toEqual({
      bold: "5a6b9b258145e243dfd5f70cc869119c6af708843658e380304bdfe3d4f4eaef",
      regular: "1f56c8535b6592672ea7f540a67bb5792c34558d72875fc504166a3e2b28b4b1",
    });
    expect(valid.headline.rightExclusive).toBeLessThanOrEqual(633);
    expect(valid.subcopy.rightExclusive).toBeLessThanOrEqual(633);
    await expect(
      validateThumbnailBoxRightText({
        headline: "PI-2C real sample D_wide_negative_space 특별 기획",
        subcopy: "실제 제품으로 확인하는 카카오모먼트 소재",
      }),
    ).rejects.toMatchObject({ code: "CANONICAL_THUMBNAIL_TEXT_OVERFLOW" });
    await expect(
      validateThumbnailBoxRightText({ headline: "자코모 😀", subcopy: "거실을 바꾸는 선택" }),
    ).rejects.toMatchObject({ code: "CANONICAL_THUMBNAIL_FONT_GLYPH_UNSUPPORTED" });
  });

  it("fails closed before raster output when copy would enter IMAGE_PRIMARY", async () => {
    const bytes = new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "packages/renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
        ),
      ),
    );
    const result = await renderThumbnail(bytes, "image/png", {
      headline: "PI-2C real sample D_wide_negative_space 특별 기획",
      subcopy: "실제 제품으로 확인하는 카카오모먼트 소재",
    });
    expect(result).toMatchObject({
      status: "FAILED",
      error: { code: "CANONICAL_THUMBNAIL_TEXT_OVERFLOW" },
    });
  });

  it("connects the frozen thumbnail renderer with one semantic candidate and plan", async () => {
    const bytes = new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "packages/renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
        ),
      ),
    );
    const result = await renderThumbnail(bytes, "image/png");
    expect(result.status).toBe("COMPLETED");
    if (result.status !== "COMPLETED") return;
    expect(result.width).toBe(1029);
    expect(result.height).toBe(258);
    expect(result.renderMetadata.rendererIntegrationOutput).toMatchObject({
      status: "PASS",
      appliedImagePlacements: [
        {
          imageSlotId: "IMAGE_PRIMARY",
          policy: "SEMANTIC_CROP_COVER",
          alphaTrimApplied: false,
          changedFromRequestedPlan: false,
        },
      ],
    });
    const textVisualQa = await inspectThumbnailBoxRightTextRaster(
      result.outputBytes ?? new Uint8Array(),
      {
        headline: "자코모 프리미엄 소파",
        subcopy: "거실을 바꾸는 선택",
      },
    );
    expect(textVisualQa).toMatchObject({
      status: "PASS",
      hangulGlyphsRendered: true,
      expectedTextPixelsInImageSlot: 0,
      textRegionMismatchPixels: 0,
    });
  });

  it("accepts a real JPEG source while preserving the PNG artifact contract", async () => {
    const bytes = new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "packages/renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__jpeg__pass.jpg",
        ),
      ),
    );
    const result = await renderThumbnail(bytes, "image/jpeg");
    expect(result.status).toBe("COMPLETED");
    if (result.status !== "COMPLETED") return;
    expect(result.width).toBe(1029);
    expect(result.height).toBe(258);
    expect(result.renderMetadata.rendererIntegrationOutput?.artifact?.mimeType).toBe("image/png");
  });
});
