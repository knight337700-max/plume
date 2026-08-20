import { createHash } from "node:crypto";

import {
  INTEGRATION_SCHEMA_VERSION,
  NORMALIZED_EPSILON,
  canonicalJson,
  normalizedRectToPixelRect,
  validateNormalizedPoint,
  validateNormalizedRect,
  validatePlacementPlan,
  validateProtectedSubjects,
  type CropCandidate,
  type ImagePlacementPlan,
  type NormalizedPoint,
  type NormalizedRect,
  type PixelRect,
  type RendererAssetDescriptor,
  type RendererValidationIssue,
} from "@plume/renderer-vendor";

export const SEMANTIC_IMAGE_SLOT_ID = "IMAGE_PRIMARY" as const;
export const SEMANTIC_CROP_BASE_WIDTH = 105 as const;
export const SEMANTIC_CROP_BASE_HEIGHT = 62 as const;

export type SemanticPlacementErrorCode =
  | "SEMANTIC_IMAGE_INPUT_REQUIRED"
  | "SEMANTIC_IMAGE_CARDINALITY_INVALID"
  | "SEMANTIC_IMAGE_MIME_MISMATCH"
  | "SEMANTIC_SUBJECT_NOT_FOUND"
  | "SEMANTIC_SUBJECT_BOUNDS_INVALID"
  | "SEMANTIC_REGION_INVALID"
  | "SEMANTIC_REGION_DOES_NOT_CONTAIN_SUBJECT"
  | "SEMANTIC_FOCAL_POINT_INVALID"
  | "SEMANTIC_FOCAL_POINT_OUTSIDE_SUBJECT"
  | "SEMANTIC_CROP_REGION_UNFIT"
  | "SEMANTIC_CROP_ROUNDTRIP_MISMATCH"
  | "SEMANTIC_RENDERER_CONTRACT_REJECTED"
  | "SEMANTIC_EVIDENCE_MISSING"
  | "SEMANTIC_SOURCE_EVIDENCE_DRIFT"
  | "SEMANTIC_TARGET_EVIDENCE_DRIFT"
  | "SEMANTIC_EVIDENCE_FINGERPRINT_MISMATCH"
  | "SEMANTIC_CANDIDATE_PLAN_MISMATCH"
  | "SEMANTIC_AGENT_FAILED";

export class SemanticPlacementError extends Error {
  readonly code: SemanticPlacementErrorCode;
  readonly issues?: readonly RendererValidationIssue[];

  constructor(
    code: SemanticPlacementErrorCode,
    message: string,
    issues?: readonly RendererValidationIssue[],
  ) {
    super(`${code}: ${message}`);
    this.name = "SemanticPlacementError";
    this.code = code;
    if (issues?.length) this.issues = issues;
  }
}

export interface SemanticPlacementGeometry {
  readonly primarySubjectBounds: NormalizedRect;
  readonly semanticRegion: NormalizedRect;
  readonly focalPoint: NormalizedPoint;
  readonly confidence: number;
  readonly rationale: string;
}

export interface SemanticCropCandidateBuildInput extends SemanticPlacementGeometry {
  readonly assetId: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly assetDescriptor?: RendererAssetDescriptor;
  readonly imageSlotId?: string;
}

export interface SemanticCropCandidateBuildResult {
  readonly candidate: CropCandidate;
  readonly acceptedPlan: ImagePlacementPlan;
  readonly cropPixelRect: PixelRect;
}

function fail(code: SemanticPlacementErrorCode, message: string): never {
  throw new SemanticPlacementError(code, message);
}

function ensureRect(
  value: unknown,
  code: "SEMANTIC_SUBJECT_BOUNDS_INVALID" | "SEMANTIC_REGION_INVALID",
  label: string,
): asserts value is NormalizedRect {
  const issues = validateNormalizedRect(value, label);
  if (issues.length) fail(code, `${label} is not a valid normalized rectangle`);
}

function ensurePoint(value: unknown): asserts value is NormalizedPoint {
  if (validateNormalizedPoint(value, "focalPoint").length)
    fail("SEMANTIC_FOCAL_POINT_INVALID", "focalPoint is not a valid normalized point");
}

function contains(outer: NormalizedRect, inner: NormalizedRect): boolean {
  return (
    inner.x >= outer.x - NORMALIZED_EPSILON &&
    inner.y >= outer.y - NORMALIZED_EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + NORMALIZED_EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + NORMALIZED_EPSILON
  );
}

function pointInside(rect: NormalizedRect, point: NormalizedPoint): boolean {
  return (
    point.x >= rect.x - NORMALIZED_EPSILON &&
    point.y >= rect.y - NORMALIZED_EPSILON &&
    point.x <= rect.x + rect.width + NORMALIZED_EPSILON &&
    point.y <= rect.y + rect.height + NORMALIZED_EPSILON
  );
}

function bound(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function canonicalCandidateDigest(input: {
  readonly assetId: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly primarySubjectBounds: NormalizedRect;
  readonly semanticRegion: NormalizedRect;
  readonly focalPoint: NormalizedPoint;
  readonly cropPixelRect: PixelRect;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        schemaVersion: INTEGRATION_SCHEMA_VERSION,
        assetId: input.assetId,
        sourceWidth: input.sourceWidth,
        sourceHeight: input.sourceHeight,
        primarySubjectBounds: input.primarySubjectBounds,
        semanticRegion: input.semanticRegion,
        focalPoint: input.focalPoint,
        cropPixelRect: input.cropPixelRect,
      }),
      "utf8",
    )
    .digest("hex");
}

function defaultAssetDescriptor(assetId: string): RendererAssetDescriptor {
  return {
    assetId,
    mimeType: "image/png",
    assetRef: { type: "FIXTURE_ASSET_ID", value: assetId },
  };
}

function contractIssues(
  plan: ImagePlacementPlan,
  candidate: CropCandidate,
  asset: RendererAssetDescriptor,
): RendererValidationIssue[] {
  const assets = new Map([[asset.assetId, asset]]);
  const candidates = new Map([[candidate.candidateId, candidate]]);
  return [
    ...validatePlacementPlan(plan, assets, candidates, {
      allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"],
      allowedImageSlotIds: [plan.imageSlotId],
    }),
    ...validateProtectedSubjects(plan, candidate.cropRect),
  ];
}

/**
 * Pure, deterministic semantic crop construction. It consumes only already
 * validated Agent geometry and source dimensions; no provider, filesystem, or
 * renderer execution is performed here.
 */
export function buildSemanticCropCandidate(
  input: SemanticCropCandidateBuildInput,
): SemanticCropCandidateBuildResult {
  if (!input.assetId.trim()) fail("SEMANTIC_CROP_REGION_UNFIT", "assetId is required");
  const imageSlotId = input.imageSlotId ?? SEMANTIC_IMAGE_SLOT_ID;
  if (imageSlotId !== SEMANTIC_IMAGE_SLOT_ID)
    fail("SEMANTIC_RENDERER_CONTRACT_REJECTED", "semantic crop candidate requires IMAGE_PRIMARY");
  if (
    !Number.isInteger(input.sourceWidth) ||
    !Number.isInteger(input.sourceHeight) ||
    input.sourceWidth <= 0 ||
    input.sourceHeight <= 0
  )
    fail("SEMANTIC_CROP_REGION_UNFIT", "source dimensions must be positive integers");

  ensureRect(input.primarySubjectBounds, "SEMANTIC_SUBJECT_BOUNDS_INVALID", "primarySubjectBounds");
  ensureRect(input.semanticRegion, "SEMANTIC_REGION_INVALID", "semanticRegion");
  ensurePoint(input.focalPoint);
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    fail("SEMANTIC_AGENT_FAILED", "confidence must be within 0..1");
  if (typeof input.rationale !== "string" || !input.rationale.trim())
    fail("SEMANTIC_AGENT_FAILED", "rationale is required");
  if (!contains(input.semanticRegion, input.primarySubjectBounds))
    fail(
      "SEMANTIC_REGION_DOES_NOT_CONTAIN_SUBJECT",
      "semanticRegion must fully contain primarySubjectBounds",
    );
  if (!pointInside(input.primarySubjectBounds, input.focalPoint))
    fail("SEMANTIC_FOCAL_POINT_OUTSIDE_SUBJECT", "focalPoint must be inside primarySubjectBounds");

  let requiredPixels: PixelRect;
  try {
    requiredPixels = normalizedRectToPixelRect(
      input.semanticRegion,
      input.sourceWidth,
      input.sourceHeight,
    );
  } catch {
    fail("SEMANTIC_REGION_INVALID", "semanticRegion cannot be converted to source pixels");
  }
  const scale = Math.ceil(
    Math.max(
      requiredPixels.width / SEMANTIC_CROP_BASE_WIDTH,
      requiredPixels.height / SEMANTIC_CROP_BASE_HEIGHT,
    ),
  );
  const cropWidth = SEMANTIC_CROP_BASE_WIDTH * Math.max(1, scale);
  const cropHeight = SEMANTIC_CROP_BASE_HEIGHT * Math.max(1, scale);
  if (cropWidth > input.sourceWidth || cropHeight > input.sourceHeight)
    fail("SEMANTIC_CROP_REGION_UNFIT", "exact-ratio crop does not fit the source image");

  const minLeft = Math.max(0, requiredPixels.x + requiredPixels.width - cropWidth);
  const maxLeft = Math.min(requiredPixels.x, input.sourceWidth - cropWidth);
  const minTop = Math.max(0, requiredPixels.y + requiredPixels.height - cropHeight);
  const maxTop = Math.min(requiredPixels.y, input.sourceHeight - cropHeight);
  if (minLeft > maxLeft || minTop > maxTop)
    fail("SEMANTIC_CROP_REGION_UNFIT", "semantic region cannot fit an exact-ratio crop");

  const desiredLeft = Math.round(input.focalPoint.x * input.sourceWidth - cropWidth / 2);
  const desiredTop = Math.round(input.focalPoint.y * input.sourceHeight - cropHeight / 2);
  const left = bound(desiredLeft, minLeft, maxLeft);
  const top = bound(desiredTop, minTop, maxTop);
  const cropPixelRect: PixelRect = {
    x: left,
    y: top,
    width: cropWidth,
    height: cropHeight,
  };
  if (cropPixelRect.width * 186 !== cropPixelRect.height * 315)
    fail("SEMANTIC_CROP_REGION_UNFIT", "crop pixel ratio is not exactly 315:186");

  const cropRect: NormalizedRect = {
    x: left / input.sourceWidth,
    y: top / input.sourceHeight,
    width: cropWidth / input.sourceWidth,
    height: cropHeight / input.sourceHeight,
  };
  let roundTrip: PixelRect;
  try {
    roundTrip = normalizedRectToPixelRect(cropRect, input.sourceWidth, input.sourceHeight);
  } catch {
    fail("SEMANTIC_CROP_ROUNDTRIP_MISMATCH", "normalized crop cannot be converted back to pixels");
  }
  if (
    roundTrip.x !== cropPixelRect.x ||
    roundTrip.y !== cropPixelRect.y ||
    roundTrip.width !== cropPixelRect.width ||
    roundTrip.height !== cropPixelRect.height
  )
    fail("SEMANTIC_CROP_ROUNDTRIP_MISMATCH", "normalized crop pixel round-trip changed boundaries");

  const candidateId = `semantic-${canonicalCandidateDigest({
    assetId: input.assetId,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    primarySubjectBounds: input.primarySubjectBounds,
    semanticRegion: input.semanticRegion,
    focalPoint: input.focalPoint,
    cropPixelRect,
  })}`;
  const candidate: CropCandidate = {
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    candidateId,
    assetId: input.assetId,
    imageSlotId,
    cropRect,
    focalPoint: input.focalPoint,
    preservedSubjectIds: ["primary-product"],
    clippedSubjectIds: [],
    fillRatio: 1,
    subjectCoverageRatio: 1,
    warnings: [],
  };
  const acceptedPlan: ImagePlacementPlan = {
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    imageSlotId,
    assetId: input.assetId,
    policy: "SEMANTIC_CROP_COVER",
    source: "AGENT",
    fitMode: "COVER",
    anchor: "CENTER",
    subjectProtection: "REQUIRED",
    cropCandidateId: candidateId,
    focalPoint: input.focalPoint,
    confidence: input.confidence,
    protectedSubjects: [
      {
        subjectId: "primary-product",
        subjectType: "PRODUCT",
        bounds: input.primarySubjectBounds,
      },
    ],
    rationale: input.rationale,
  };
  const issues = contractIssues(
    acceptedPlan,
    candidate,
    input.assetDescriptor ?? defaultAssetDescriptor(input.assetId),
  );
  const errors = issues.filter((issue) => issue.severity === "ERROR");
  if (errors.length)
    throw new SemanticPlacementError(
      "SEMANTIC_RENDERER_CONTRACT_REJECTED",
      "Renderer contract rejected the semantic placement plan",
      errors,
    );
  return Object.freeze({ candidate, acceptedPlan, cropPixelRect });
}
