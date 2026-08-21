import { describe, expect, it } from "vitest";
import {
  buildSemanticCropCandidate,
  type SemanticCropCandidateBuildInput,
} from "./semantic-crop-candidate.js";
import {
  validatePlacementPlan,
  validateProtectedSubjects,
  normalizedRectToPixelRect,
  type RendererAssetDescriptor,
} from "@plume/renderer-vendor";

const asset: RendererAssetDescriptor = {
  assetId: "asset-1",
  mimeType: "image/png",
  assetRef: { type: "FIXTURE_ASSET_ID", value: "asset-1" },
};

function input(
  overrides: Partial<SemanticCropCandidateBuildInput> = {},
): SemanticCropCandidateBuildInput {
  return {
    assetId: "asset-1",
    assetDescriptor: asset,
    sourceWidth: 2000,
    sourceHeight: 1200,
    primarySubjectBounds: { x: 0.35, y: 0.25, width: 0.2, height: 0.3 },
    semanticRegion: { x: 0.2, y: 0.1, width: 0.6, height: 0.6 },
    focalPoint: { x: 0.45, y: 0.4 },
    confidence: 1,
    rationale: "deterministic test placement",
    ...overrides,
  };
}

function inputForPixelCrop(
  sourceWidth: number,
  sourceHeight: number,
  crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): SemanticCropCandidateBuildInput {
  const semanticWidth = Math.max(1, crop.width - 20);
  const semanticHeight = Math.max(1, crop.height - 20);
  const focalX = crop.x + crop.width / 2 + 0.25;
  const focalY = crop.y + crop.height / 2 + 0.25;
  const subjectX = focalX - 5;
  const subjectY = focalY - 5;
  return input({
    sourceWidth,
    sourceHeight,
    primarySubjectBounds: {
      x: subjectX / sourceWidth,
      y: subjectY / sourceHeight,
      width: 10 / sourceWidth,
      height: 10 / sourceHeight,
    },
    semanticRegion: {
      x: (crop.x + 0.5) / sourceWidth,
      y: (crop.y + 0.5) / sourceHeight,
      width: semanticWidth / sourceWidth,
      height: semanticHeight / sourceHeight,
    },
    focalPoint: { x: focalX / sourceWidth, y: focalY / sourceHeight },
  });
}

const fixedRoundTripCases = [
  { sourceWidth: 1448, sourceHeight: 1086, crop: { x: 0, y: 6, width: 105, height: 62 } },
  { sourceWidth: 1024, sourceHeight: 768, crop: { x: 0, y: 36, width: 105, height: 62 } },
  { sourceWidth: 1920, sourceHeight: 1080, crop: { x: 0, y: 37, width: 105, height: 62 } },
  { sourceWidth: 4032, sourceHeight: 3024, crop: { x: 0, y: 129, width: 105, height: 62 } },
  { sourceWidth: 1001, sourceHeight: 777, crop: { x: 0, y: 48, width: 105, height: 62 } },
  { sourceWidth: 315, sourceHeight: 186, crop: { x: 0, y: 13, width: 105, height: 62 } },
  { sourceWidth: 630, sourceHeight: 372, crop: { x: 0, y: 13, width: 105, height: 62 } },
] as const;

describe("semantic crop candidate builder", () => {
  it.each([
    ["centered", { focalPoint: { x: 0.5, y: 0.5 } }],
    [
      "left-weighted",
      {
        primarySubjectBounds: { x: 0.05, y: 0.25, width: 0.2, height: 0.3 },
        semanticRegion: { x: 0, y: 0.1, width: 0.45, height: 0.6 },
        focalPoint: { x: 0.15, y: 0.4 },
      },
    ],
    [
      "right-weighted",
      {
        primarySubjectBounds: { x: 0.75, y: 0.25, width: 0.2, height: 0.3 },
        semanticRegion: { x: 0.55, y: 0.1, width: 0.45, height: 0.6 },
        focalPoint: { x: 0.85, y: 0.4 },
      },
    ],
    [
      "tall source",
      {
        sourceWidth: 1200,
        sourceHeight: 2000,
        semanticRegion: { x: 0.2, y: 0.2, width: 0.6, height: 0.3 },
        primarySubjectBounds: { x: 0.35, y: 0.25, width: 0.2, height: 0.15 },
        focalPoint: { x: 0.45, y: 0.325 },
      },
    ],
    [
      "wide source",
      {
        sourceWidth: 2400,
        sourceHeight: 900,
        semanticRegion: { x: 0.2, y: 0.2, width: 0.6, height: 0.4 },
        primarySubjectBounds: { x: 0.35, y: 0.25, width: 0.2, height: 0.2 },
        focalPoint: { x: 0.45, y: 0.35 },
      },
    ],
    [
      "near edge",
      {
        primarySubjectBounds: { x: 0.02, y: 0.3, width: 0.16, height: 0.2 },
        semanticRegion: { x: 0, y: 0.2, width: 0.3, height: 0.4 },
        focalPoint: { x: 0.1, y: 0.4 },
      },
    ],
  ] as const)("preserves the %s geometry", (_name, overrides) => {
    const result = buildSemanticCropCandidate(input(overrides));
    const crop = result.cropPixelRect;
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(input(overrides).sourceWidth ?? 2000);
    expect(crop.y + crop.height).toBeLessThanOrEqual(input(overrides).sourceHeight ?? 1200);
    expect(crop.width * 186).toBe(crop.height * 315);
    expect(result.candidate.preservedSubjectIds).toEqual(["primary-product"]);
    expect(result.candidate.clippedSubjectIds).toEqual([]);
    expect(result.candidate.fillRatio).toBe(1);
    expect(result.candidate.subjectCoverageRatio).toBe(1);
    expect(result.acceptedPlan.cropCandidateId).toBe(result.candidate.candidateId);
    expect(result.acceptedPlan.cropRect).toBeUndefined();
  });

  it("is deterministic and passes the generic renderer validators", () => {
    const first = buildSemanticCropCandidate(input());
    const second = buildSemanticCropCandidate(input());
    expect(second).toEqual(first);
    const issues = validatePlacementPlan(
      first.acceptedPlan,
      new Map([[asset.assetId, asset]]),
      new Map([[first.candidate.candidateId, first.candidate]]),
      {
        allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"],
        allowedImageSlotIds: ["IMAGE_PRIMARY"],
      },
    );
    expect(issues.filter((issue) => issue.severity === "ERROR")).toEqual([]);
    expect(validateProtectedSubjects(first.acceptedPlan, first.candidate.cropRect)).toEqual([]);
    expect(first.candidate.candidateId).toMatch(/^semantic-[a-f0-9]{64}$/u);
  });

  it("reproduces the naive 1448x1086 boundary drift", () => {
    const naiveCropRect = {
      x: 0 / 1448,
      y: 6 / 1086,
      width: 105 / 1448,
      height: 62 / 1086,
    };
    expect(normalizedRectToPixelRect(naiveCropRect, 1448, 1086)).toEqual({
      x: 0,
      y: 6,
      width: 105,
      height: 63,
    });
  });

  it.each(fixedRoundTripCases)(
    "canonicalizes the fixed $sourceWidth x $sourceHeight pixel crop exactly",
    ({ sourceWidth, sourceHeight, crop }) => {
      const first = buildSemanticCropCandidate(inputForPixelCrop(sourceWidth, sourceHeight, crop));
      const second = buildSemanticCropCandidate(inputForPixelCrop(sourceWidth, sourceHeight, crop));
      expect(first.cropPixelRect).toEqual(crop);
      expect(
        normalizedRectToPixelRect(first.candidate.cropRect, sourceWidth, sourceHeight),
      ).toEqual(crop);
      expect(second).toEqual(first);
      expect(first.candidate.preservedSubjectIds).toEqual(["primary-product"]);
      expect(first.candidate.clippedSubjectIds).toEqual([]);
      expect(first.acceptedPlan.cropCandidateId).toBe(first.candidate.candidateId);
      expect(first.acceptedPlan.policy).toBe("SEMANTIC_CROP_COVER");
      expect(first.acceptedPlan.source).toBe("AGENT");
      expect(first.acceptedPlan.fitMode).toBe("COVER");
      expect(first.acceptedPlan.anchor).toBe("CENTER");
      expect(first.acceptedPlan.subjectProtection).toBe("REQUIRED");
      expect(first.acceptedPlan.protectedSubjects[0]?.subjectType).toBe("PRODUCT");
    },
  );

  it.each([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 1024 - 105 - 1, y: 768 - 62 - 1 },
    { x: 1024 - 105, y: 768 - 62 },
  ])("preserves boundary crop origin (%s, %s)", (origin) => {
    const crop = { ...origin, width: 105, height: 62 };
    const result = buildSemanticCropCandidate(inputForPixelCrop(1024, 768, crop));
    expect(result.cropPixelRect).toEqual(crop);
    expect(normalizedRectToPixelRect(result.candidate.cropRect, 1024, 768)).toEqual(crop);
  });

  it.each([
    { width: 105, height: 62 },
    { width: 210, height: 124 },
    { width: 315, height: 186 },
  ])("preserves exact-ratio crop scale %s", (cropSize) => {
    const crop = { x: 0, y: 0, ...cropSize };
    const result = buildSemanticCropCandidate(inputForPixelCrop(1000, 800, crop));
    expect(result.cropPixelRect).toEqual(crop);
    expect(result.cropPixelRect.width * 186).toBe(result.cropPixelRect.height * 315);
    expect(normalizedRectToPixelRect(result.candidate.cropRect, 1000, 800)).toEqual(crop);
  });

  it.each([
    [
      "invalid subject",
      { primarySubjectBounds: { x: -0.1, y: 0, width: 0.2, height: 0.2 } },
      "SEMANTIC_SUBJECT_BOUNDS_INVALID",
    ],
    [
      "invalid region",
      { semanticRegion: { x: 0.2, y: 0.2, width: 0, height: 0.2 } },
      "SEMANTIC_REGION_INVALID",
    ],
    [
      "region excludes subject",
      { semanticRegion: { x: 0.6, y: 0.1, width: 0.2, height: 0.2 } },
      "SEMANTIC_REGION_DOES_NOT_CONTAIN_SUBJECT",
    ],
    [
      "focal outside subject",
      { focalPoint: { x: 0.1, y: 0.1 } },
      "SEMANTIC_FOCAL_POINT_OUTSIDE_SUBJECT",
    ],
    [
      "exact ratio cannot fit",
      {
        sourceWidth: 100,
        sourceHeight: 100,
        semanticRegion: { x: 0, y: 0, width: 1, height: 1 },
        primarySubjectBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        focalPoint: { x: 0.2, y: 0.2 },
      },
      "SEMANTIC_CROP_REGION_UNFIT",
    ],
  ] as const)("fails closed for %s", (_name, overrides, code) => {
    expect(() => buildSemanticCropCandidate(input(overrides))).toThrow(code);
  });
});
