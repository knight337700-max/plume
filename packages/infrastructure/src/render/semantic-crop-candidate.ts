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
  /**
   * Optional exact output slot dimensions.  Omitting these preserves the
   * historical PI-2 315:186 candidate identity and geometry.
   */
  readonly targetPixelWidth?: number;
  readonly targetPixelHeight?: number;
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

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

const BINARY64_BUFFER = new ArrayBuffer(8);
const BINARY64_VIEW = new DataView(BINARY64_BUFFER);

function nextUp(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return Number.MIN_VALUE;
  BINARY64_VIEW.setFloat64(0, value, false);
  let bits = BINARY64_VIEW.getBigUint64(0, false);
  bits = value > 0 ? bits + 1n : bits - 1n;
  BINARY64_VIEW.setBigUint64(0, bits, false);
  return BINARY64_VIEW.getFloat64(0, false);
}

function nextDown(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return -Number.MIN_VALUE;
  BINARY64_VIEW.setFloat64(0, value, false);
  let bits = BINARY64_VIEW.getBigUint64(0, false);
  bits = value > 0 ? bits - 1n : bits + 1n;
  BINARY64_VIEW.setBigUint64(0, bits, false);
  return BINARY64_VIEW.getFloat64(0, false);
}

function adjacentBinary64Values(value: number): number[] {
  return [...new Set([value, nextDown(value), nextUp(value)])].map((candidate) =>
    candidate === 0 ? 0 : candidate,
  );
}

function sortByNaturalDistance(candidates: number[], natural: number): number[] {
  return candidates.sort((left, right) => {
    const distance = Math.abs(left - natural) - Math.abs(right - natural);
    return distance === 0 ? left - right : distance;
  });
}

function edgeCandidates(
  edgePixels: number,
  sourceDimension: number,
  edgeKind: "floor" | "ceil",
): number[] {
  const natural = edgePixels / sourceDimension;
  const candidates = adjacentBinary64Values(natural).filter(
    (candidate) =>
      Number.isFinite(candidate) &&
      candidate >= 0 &&
      candidate <= 1 &&
      (edgeKind === "floor"
        ? Math.floor(candidate * sourceDimension) === edgePixels
        : Math.ceil(candidate * sourceDimension) === edgePixels),
  );
  return sortByNaturalDistance(candidates, natural);
}

interface CanonicalAxisRect {
  readonly start: number;
  readonly span: number;
}

function canonicalAxisRect(
  startPixels: number,
  spanPixels: number,
  sourceDimension: number,
): CanonicalAxisRect | undefined {
  const endPixels = startPixels + spanPixels;
  const startNatural = startPixels / sourceDimension;
  const endNatural = endPixels / sourceDimension;
  const starts = edgeCandidates(startPixels, sourceDimension, "floor");
  const ends = edgeCandidates(endPixels, sourceDimension, "ceil");
  const candidates: {
    readonly start: number;
    readonly span: number;
    readonly score: readonly number[];
  }[] = [];

  for (const start of starts) {
    for (const end of ends) {
      const naturalSpan = end - start;
      for (const span of sortByNaturalDistance(
        adjacentBinary64Values(naturalSpan).filter(
          (candidate) =>
            Number.isFinite(candidate) &&
            candidate > 0 &&
            candidate <= 1 &&
            start + candidate >= 0 &&
            start + candidate <= 1 &&
            Math.ceil((start + candidate) * sourceDimension) === endPixels,
        ),
        naturalSpan,
      )) {
        candidates.push({
          start,
          span,
          score: [
            Math.abs(start - startNatural),
            Math.abs(end - endNatural),
            Math.abs(span - naturalSpan),
            start,
            end,
            span,
          ],
        });
      }
    }
  }

  candidates.sort((left, right) => {
    for (let index = 0; index < left.score.length; index += 1) {
      const difference = left.score[index]! - right.score[index]!;
      if (difference !== 0) return difference;
    }
    return 0;
  });
  const selected = candidates[0];
  return selected === undefined ? undefined : { start: selected.start, span: selected.span };
}

function samePixelRect(left: PixelRect, right: PixelRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function pixelRectToCanonicalNormalizedRect(
  pixelRect: PixelRect,
  sourceWidth: number,
  sourceHeight: number,
): NormalizedRect | undefined {
  const horizontal = canonicalAxisRect(pixelRect.x, pixelRect.width, sourceWidth);
  const vertical = canonicalAxisRect(pixelRect.y, pixelRect.height, sourceHeight);
  if (horizontal === undefined || vertical === undefined) return undefined;
  const rect: NormalizedRect = {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.span,
    height: vertical.span,
  };
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > 1 ||
    rect.y + rect.height > 1 ||
    validateNormalizedRect(rect, "canonicalCropRect").length > 0
  )
    return undefined;
  try {
    return samePixelRect(normalizedRectToPixelRect(rect, sourceWidth, sourceHeight), pixelRect)
      ? rect
      : undefined;
  } catch {
    return undefined;
  }
}

function canonicalCandidateDigest(input: {
  readonly assetId: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly primarySubjectBounds: NormalizedRect;
  readonly semanticRegion: NormalizedRect;
  readonly focalPoint: NormalizedPoint;
  readonly cropPixelRect: PixelRect;
  readonly targetPixelWidth?: number;
  readonly targetPixelHeight?: number;
}): string {
  const target =
    input.targetPixelWidth === undefined || input.targetPixelHeight === undefined
      ? {}
      : {
          targetPixelWidth: input.targetPixelWidth,
          targetPixelHeight: input.targetPixelHeight,
        };
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
        ...target,
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
  const hasTargetWidth = input.targetPixelWidth !== undefined;
  const hasTargetHeight = input.targetPixelHeight !== undefined;
  if (hasTargetWidth !== hasTargetHeight)
    fail("SEMANTIC_CROP_REGION_UNFIT", "target pixel width and height must be provided together");
  const targetPixelWidth = input.targetPixelWidth ?? 315;
  const targetPixelHeight = input.targetPixelHeight ?? 186;
  if (
    !Number.isInteger(targetPixelWidth) ||
    !Number.isInteger(targetPixelHeight) ||
    targetPixelWidth <= 0 ||
    targetPixelHeight <= 0
  )
    fail("SEMANTIC_CROP_REGION_UNFIT", "target pixel dimensions must be positive integers");
  const ratioDivisor = greatestCommonDivisor(targetPixelWidth, targetPixelHeight);
  if (ratioDivisor <= 0)
    fail("SEMANTIC_CROP_REGION_UNFIT", "target pixel dimensions have no exact ratio");
  const cropBaseWidth = targetPixelWidth / ratioDivisor;
  const cropBaseHeight = targetPixelHeight / ratioDivisor;
  const includeTargetInCandidateId = !(targetPixelWidth === 315 && targetPixelHeight === 186);

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
    Math.max(requiredPixels.width / cropBaseWidth, requiredPixels.height / cropBaseHeight),
  );
  const cropWidth = cropBaseWidth * Math.max(1, scale);
  const cropHeight = cropBaseHeight * Math.max(1, scale);
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
  if (cropPixelRect.width * targetPixelHeight !== cropPixelRect.height * targetPixelWidth)
    fail("SEMANTIC_CROP_REGION_UNFIT", "crop pixel ratio does not match the target slot");

  const cropRect = pixelRectToCanonicalNormalizedRect(
    cropPixelRect,
    input.sourceWidth,
    input.sourceHeight,
  );
  if (cropRect === undefined)
    fail("SEMANTIC_CROP_ROUNDTRIP_MISMATCH", "normalized crop pixel round-trip changed boundaries");

  const candidateId = `semantic-${canonicalCandidateDigest({
    assetId: input.assetId,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    primarySubjectBounds: input.primarySubjectBounds,
    semanticRegion: input.semanticRegion,
    focalPoint: input.focalPoint,
    cropPixelRect,
    ...(includeTargetInCandidateId ? { targetPixelWidth, targetPixelHeight } : {}),
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
