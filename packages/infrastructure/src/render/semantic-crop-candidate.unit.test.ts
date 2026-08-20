import { describe, expect, it } from "vitest";
import {
  buildSemanticCropCandidate,
  type SemanticCropCandidateBuildInput,
} from "./semantic-crop-candidate.js";
import {
  validatePlacementPlan,
  validateProtectedSubjects,
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
