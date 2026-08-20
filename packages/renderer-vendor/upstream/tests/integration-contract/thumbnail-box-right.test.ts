import { readFile } from "node:fs/promises";
import path from "node:path";

import { GlobalFonts } from "@napi-rs/canvas";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  renderWithIntegrationAdapter,
  type RendererIntegrationInputV1,
} from "../../packages/renderer-contract/src/index.js";
import { renderThumbnailBoxRight } from "../../src/core/thumbnail-box-right.js";
import { inspectImageFile } from "../../src/core/image-input.js";
import { sha256Bytes } from "../../src/core/hash.js";

const root = path.resolve(import.meta.dirname, "../..");

GlobalFonts.registerFromPath(path.join(root, "assets", "fonts", "SpoqaHanSansBold.ttf"), "KBR Spoqa Han Sans Bold");
GlobalFonts.registerFromPath(path.join(root, "assets", "fonts", "SpoqaHanSansRegular.ttf"), "KBR Spoqa Han Sans Regular");

async function loadFixture(name: string): Promise<RendererIntegrationInputV1> {
  return JSON.parse(await readFile(path.join(root, "fixtures", "integration", "thumbnail-box-right", name, "input.json"), "utf8")) as RendererIntegrationInputV1;
}

async function render(input: RendererIntegrationInputV1, assetPath = assetPathDefault) {
  const bytes = await readFile(assetPath);
  const inspected = await inspectImageFile(assetPath);
  return renderWithIntegrationAdapter(input, {
    resolver: { resolve: async () => ({ bytes, resolvedMimeType: inspected.metadata.detectedMimeType, metadata: inspected.metadata }) },
    renderThumbnail: async (request) => renderThumbnailBoxRight(request),
  });
}

const assetPathDefault = path.join(root, "fixtures", "valid", "thumbnail-box-right__asset__basic__pass.png");
const jpegAssetPath = path.join(root, "fixtures", "valid", "thumbnail-box-right__asset__jpeg__pass.jpg");

describe("THUMBNAIL_BOX_RIGHT integration execution", () => {
  it.each([
    ["manual-crop-pass", "PASS"],
    ["semantic-crop-direct-pass", "PASS"],
    ["semantic-crop-candidate-pass", "PASS"],
  ])("renders %s", async (fixture, expected) => {
    const result = await render(await loadFixture(fixture));
    expect(result.status).toBe(expected);
    expect(result.artifact?.width).toBe(1029);
    expect(result.artifact?.height).toBe(258);
    expect(result.appliedImagePlacements[0]?.destinationRect).toEqual({ x: 666, y: 36, width: 315, height: 186 });
  });

  it.each([
    ["missing-crop-error", "KBR-CROP-RECT-REQUIRED"],
    ["candidate-not-found-error", "KBR-CROP-CANDIDATE-NOT-FOUND"],
    ["required-subject-clipped-error", "KBR-PROTECTED-SUBJECT-CLIPPED"],
  ])("blocks %s with %s", async (fixture, code) => {
    const result = await render(await loadFixture(fixture));
    expect(result.status).toBe("BLOCKED");
    expect(result.artifact).toBeUndefined();
    expect(result.validation.errors.map((entry) => entry.code)).toContain(code);
  });

  it("keeps the manual and agent semantic plans pixel-equivalent", async () => {
    const manual = JSON.parse(await readFile(path.join(root, "fixtures", "integration", "thumbnail-box-right", "manual-agent-equivalence", "manual.json"), "utf8")) as RendererIntegrationInputV1;
    const agent = JSON.parse(await readFile(path.join(root, "fixtures", "integration", "thumbnail-box-right", "manual-agent-equivalence", "agent.json"), "utf8")) as RendererIntegrationInputV1;
    const [manualResult, agentResult] = await Promise.all([render(manual), render(agent)]);
    expect(manualResult.status).toBe("PASS");
    expect(agentResult.status).toBe("PASS");
    expect(manualResult.artifact?.checksumSha256).toBe(agentResult.artifact?.checksumSha256);
    expect(manualResult.pixelFingerprint).toBe(agentResult.pixelFingerprint);
    expect(manualResult.requestFingerprint).not.toBe(agentResult.requestFingerprint);
  });

  it("accepts JPEG for direct, manual, and candidate crop while preserving PNG output", async () => {
    const direct = await loadFixture("semantic-crop-direct-pass");
    const directAsset = direct.assets[0];
    const directPlan = direct.imagePlacementPlans[0];
    if (!directAsset || !directPlan) throw new Error("Direct crop fixture is incomplete");
    const jpeg = {
      ...direct,
      assets: [{ ...directAsset, assetId: "thumbnail-jpeg", mimeType: "image/jpeg", assetRef: { type: "FIXTURE_ASSET_ID" as const, value: "thumbnail-box-right__asset__jpeg__pass.jpg" } }],
      imagePlacementPlans: [{ ...directPlan, assetId: "thumbnail-jpeg" }],
    } as RendererIntegrationInputV1;
    const result = await render(jpeg, jpegAssetPath);
    expect(result.status).toBe("PASS");
    expect(result.artifact?.mimeType).toBe("image/png");
    expect(result.artifact?.width).toBe(1029);
    expect(result.artifact?.height).toBe(258);
    expect(result.validation.errors).toEqual([]);

    const jpegPlan = jpeg.imagePlacementPlans[0];
    if (!jpegPlan) throw new Error("JPEG crop fixture is incomplete");
    const manual = { ...jpeg, imagePlacementPlans: [{ ...jpegPlan, policy: "MANUAL_CROP" as const, source: "MANUAL" as const }] } as RendererIntegrationInputV1;
    expect((await render(manual, jpegAssetPath)).status).toBe("PASS");

    const candidatePlan = { ...jpegPlan };
    delete candidatePlan.cropRect;
    const candidate = { ...jpeg, imagePlacementPlans: [{ ...candidatePlan, cropCandidateId: "candidate-main" }], cropCandidates: [{ schemaVersion: "1.1.0" as const, candidateId: "candidate-main", assetId: "thumbnail-jpeg", imageSlotId: "IMAGE_PRIMARY", cropRect: { x: 0, y: 0, width: 1, height: 1 }, preservedSubjectIds: [], clippedSubjectIds: [], fillRatio: 1, subjectCoverageRatio: 1, warnings: [] }] } as RendererIntegrationInputV1;
    expect((await render(candidate, jpegAssetPath)).status).toBe("PASS");
  });

  it("blocks JPEG for OBJECT_RIGHT and allows opaque PNG for THUMBNAIL_BOX_RIGHT", async () => {
    const objectInput = JSON.parse(await readFile(path.join(root, "fixtures", "integration", "alpha-trim-contain", "input.json"), "utf8")) as RendererIntegrationInputV1;
    const objectAsset = objectInput.assets[0];
    if (!objectAsset) throw new Error("Object fixture is incomplete");
    const objectJpeg = { ...objectInput, assets: [{ ...objectAsset, mimeType: "image/jpeg" as const }] };
    const objectResult = await renderWithIntegrationAdapter(objectJpeg, {
      resolver: { resolve: async () => ({ bytes: await readFile(jpegAssetPath), resolvedMimeType: "image/jpeg" }) },
      renderLegacy: async () => { throw new Error("must not render"); },
    });
    expect(objectResult.status).toBe("BLOCKED");
    expect(objectResult.validation.errors.map((entry) => entry.code)).toContain("KBR-ASSET-MIME-NOT-ALLOWED");

    const opaqueBytes = await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 30, g: 80, b: 160 } } }).png().toBuffer();
    const thumbnailInput = await loadFixture("semantic-crop-direct-pass");
    const opaqueResult = await renderWithIntegrationAdapter(thumbnailInput, {
      resolver: { resolve: async () => ({ bytes: opaqueBytes, resolvedMimeType: "image/png" }) },
      renderThumbnail: async (request) => renderThumbnailBoxRight(request),
      assetDigests: { "thumbnail-basic": await sha256Bytes(opaqueBytes) },
    });
    expect(opaqueResult.status).toBe("PASS");
  });

  it("applies EXIF Orientation 6 before normalized crop execution", async () => {
    const input = await loadFixture("semantic-crop-direct-pass");
    const inputAsset = input.assets[0];
    const inputPlan = input.imagePlacementPlans[0];
    if (!inputAsset || !inputPlan) throw new Error("Orientation fixture is incomplete");
    const orientationInput = { ...input, assets: [{ ...inputAsset, assetId: "orientation-6", mimeType: "image/jpeg" as const }], imagePlacementPlans: [{ ...inputPlan, assetId: "orientation-6" }] } as RendererIntegrationInputV1;
    const result = await render(orientationInput, path.join(root, "fixtures", "valid", "jpeg-orientation-6.jpg"));
    expect(result.status).toBe("PASS");
    expect(result.appliedImagePlacements[0]?.resolvedSourceCropPixels).toBeDefined();
  });

  it("strips JPEG metadata, emits RGBA PNG, and stays byte-deterministic", async () => {
    const input = await loadFixture("semantic-crop-direct-pass");
    const asset = input.assets[0];
    const plan = input.imagePlacementPlans[0];
    if (!asset || !plan?.cropRect) throw new Error("JPEG output fixture is incomplete");
    const bytes = await readFile(jpegAssetPath);
    const inspected = await inspectImageFile(jpegAssetPath);
    const request = {
      input: { copy: input.copy },
      asset: { ...asset, mimeType: "image/jpeg" as const },
      resolvedAsset: { bytes, resolvedMimeType: inspected.metadata.detectedMimeType, metadata: inspected.metadata },
      resolvedPlan: plan,
      resolvedSourceCropRect: plan.cropRect,
    };
    const outputs = await Promise.all([
      renderThumbnailBoxRight(request),
      renderThumbnailBoxRight(request),
      renderThumbnailBoxRight(request),
    ]);
    const digests = outputs.map(({ bytes: output }) => sha256Bytes(output));
    expect(new Set(digests).size).toBe(1);
    const metadata = await sharp(outputs[0]?.bytes ?? Buffer.alloc(0)).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1029);
    expect(metadata.height).toBe(258);
    expect(metadata.channels).toBe(4);
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.orientation).toBeUndefined();
  });
});
