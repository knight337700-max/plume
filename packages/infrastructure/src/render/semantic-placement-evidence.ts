import { createHash } from "node:crypto";
import {
  INTEGRATION_SCHEMA_VERSION,
  canonicalJson,
  validatePlacementPlan,
  validateProtectedSubjects,
  type CropCandidate,
  type ImagePlacementPlan,
  type RendererAssetDescriptor,
} from "@plume/renderer-vendor";
import type {
  SemanticPlacementAgentOutput,
  SemanticPlacementPlannerResult,
} from "./semantic-placement-planner.js";
import { SemanticPlacementError } from "./semantic-crop-candidate.js";

export const SEMANTIC_PLACEMENT_EVIDENCE_SCHEMA_VERSION = "1.0.0" as const;
export const SEMANTIC_PLACEMENT_GATE = "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E" as const;
export const SEMANTIC_PLACEMENT_MODE = "CONSTRAINED_SEMANTIC_PLACEMENT" as const;

export interface SemanticPlacementTargetEvidence {
  readonly plumeFormatProfileId: string;
  readonly rendererFormatProfileId: string;
  readonly rendererTemplateId: string;
  readonly imageSlotId: "IMAGE_PRIMARY";
}

export interface SemanticPlacementSourceEvidence {
  readonly assetVersionId: string;
  readonly fileObjectId: string;
  readonly checksumSha256: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export interface SemanticPlacementEvidence {
  readonly schemaVersion: typeof SEMANTIC_PLACEMENT_EVIDENCE_SCHEMA_VERSION;
  readonly gate: typeof SEMANTIC_PLACEMENT_GATE;
  readonly mode: typeof SEMANTIC_PLACEMENT_MODE;
  readonly target: SemanticPlacementTargetEvidence;
  readonly source: SemanticPlacementSourceEvidence;
  readonly agentOutput: SemanticPlacementAgentOutput;
  readonly candidate: CropCandidate;
  readonly acceptedPlan: ImagePlacementPlan;
  readonly evidenceFingerprint: string;
}

export interface SemanticPlacementEvidenceInput {
  readonly target: SemanticPlacementTargetEvidence;
  readonly source: SemanticPlacementSourceEvidence;
  readonly planner: Pick<
    SemanticPlacementPlannerResult,
    "agentOutput" | "candidate" | "acceptedPlan"
  >;
}

function fingerprintMaterial(
  evidence: Omit<SemanticPlacementEvidence, "evidenceFingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    target: evidence.target,
    source: evidence.source,
    agentOutput: evidence.agentOutput,
    candidate: evidence.candidate,
    acceptedPlan: evidence.acceptedPlan,
  };
}

export function semanticPlacementEvidenceFingerprint(
  evidence: Omit<SemanticPlacementEvidence, "evidenceFingerprint">,
): string {
  return createHash("sha256")
    .update(canonicalJson(fingerprintMaterial(evidence)), "utf8")
    .digest("hex");
}

export function createSemanticPlacementEvidence(
  input: SemanticPlacementEvidenceInput,
): SemanticPlacementEvidence {
  const evidenceWithoutFingerprint = {
    schemaVersion: SEMANTIC_PLACEMENT_EVIDENCE_SCHEMA_VERSION,
    gate: SEMANTIC_PLACEMENT_GATE,
    mode: SEMANTIC_PLACEMENT_MODE,
    target: input.target,
    source: input.source,
    agentOutput: input.planner.agentOutput,
    candidate: input.planner.candidate,
    acceptedPlan: input.planner.acceptedPlan,
  } satisfies Omit<SemanticPlacementEvidence, "evidenceFingerprint">;
  return Object.freeze({
    ...evidenceWithoutFingerprint,
    evidenceFingerprint: semanticPlacementEvidenceFingerprint(evidenceWithoutFingerprint),
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(
  code:
    | "SEMANTIC_EVIDENCE_MISSING"
    | "SEMANTIC_SOURCE_EVIDENCE_DRIFT"
    | "SEMANTIC_TARGET_EVIDENCE_DRIFT"
    | "SEMANTIC_EVIDENCE_FINGERPRINT_MISMATCH"
    | "SEMANTIC_CANDIDATE_PLAN_MISMATCH",
  message: string,
): never {
  throw new SemanticPlacementError(code, message);
}

function containsForbiddenSecret(value: unknown): boolean {
  if (ArrayBuffer.isView(value)) return true;
  if (typeof value === "string")
    return (
      /data:image\/|Bearer\s|Authorization|OPENAI_API_KEY/iu.test(value) ||
      /^[A-Za-z0-9+/]{256,}={0,2}$/u.test(value.trim())
    );
  if (Array.isArray(value)) return value.some(containsForbiddenSecret);
  if (object(value)) return Object.values(value).some(containsForbiddenSecret);
  return false;
}

export function parseSemanticPlacementEvidence(value: unknown): SemanticPlacementEvidence {
  if (!object(value)) fail("SEMANTIC_EVIDENCE_MISSING", "semantic placement evidence is missing");
  if (containsForbiddenSecret(value))
    fail("SEMANTIC_EVIDENCE_MISSING", "semantic placement evidence contains forbidden secret data");
  if (
    value.schemaVersion !== SEMANTIC_PLACEMENT_EVIDENCE_SCHEMA_VERSION ||
    value.gate !== SEMANTIC_PLACEMENT_GATE ||
    value.mode !== SEMANTIC_PLACEMENT_MODE ||
    !object(value.target) ||
    !object(value.source) ||
    !object(value.agentOutput) ||
    !object(value.candidate) ||
    !object(value.acceptedPlan) ||
    typeof value.evidenceFingerprint !== "string"
  )
    fail("SEMANTIC_EVIDENCE_MISSING", "semantic placement evidence shape is invalid");
  return value as unknown as SemanticPlacementEvidence;
}

export function validateSemanticPlacementEvidence(
  value: unknown,
  expected: {
    readonly target: SemanticPlacementTargetEvidence;
    readonly source: SemanticPlacementSourceEvidence;
    readonly assetId: string;
  },
): SemanticPlacementEvidence {
  const evidence = parseSemanticPlacementEvidence(value);
  const expectedFingerprint = semanticPlacementEvidenceFingerprint(evidence);
  if (evidence.evidenceFingerprint !== expectedFingerprint)
    fail("SEMANTIC_EVIDENCE_FINGERPRINT_MISMATCH", "semantic evidence fingerprint does not match");
  if (canonicalJson(evidence.target) !== canonicalJson(expected.target))
    fail("SEMANTIC_TARGET_EVIDENCE_DRIFT", "semantic target evidence differs from current binding");
  if (canonicalJson(evidence.source) !== canonicalJson(expected.source))
    fail("SEMANTIC_SOURCE_EVIDENCE_DRIFT", "semantic source evidence differs from current asset");
  const { candidate, acceptedPlan } = evidence;
  const hasPreservedProduct =
    Array.isArray(candidate.preservedSubjectIds) &&
    candidate.preservedSubjectIds.includes("primary-product");
  const hasNoClippedSubjects =
    Array.isArray(candidate.clippedSubjectIds) && candidate.clippedSubjectIds.length === 0;
  const hasProtectedProduct =
    Array.isArray(acceptedPlan.protectedSubjects) &&
    acceptedPlan.protectedSubjects.some(
      (subject) => subject.subjectId === "primary-product" && subject.subjectType === "PRODUCT",
    );
  if (
    candidate.candidateId !== acceptedPlan.cropCandidateId ||
    candidate.assetId !== expected.assetId ||
    acceptedPlan.assetId !== expected.assetId ||
    candidate.imageSlotId !== expected.target.imageSlotId ||
    acceptedPlan.imageSlotId !== expected.target.imageSlotId ||
    acceptedPlan.policy !== "SEMANTIC_CROP_COVER" ||
    acceptedPlan.source !== "AGENT" ||
    acceptedPlan.fitMode !== "COVER" ||
    acceptedPlan.anchor !== "CENTER" ||
    acceptedPlan.subjectProtection !== "REQUIRED" ||
    !hasPreservedProduct ||
    !hasNoClippedSubjects ||
    !hasProtectedProduct
  )
    fail("SEMANTIC_CANDIDATE_PLAN_MISMATCH", "semantic candidate and accepted plan are not linked");
  const descriptor: RendererAssetDescriptor = {
    assetId: expected.assetId,
    mimeType: expected.source.mimeType,
    checksumSha256: expected.source.checksumSha256,
    declaredWidth: expected.source.width,
    declaredHeight: expected.source.height,
    assetRef: { type: "FIXTURE_ASSET_ID", value: expected.assetId },
  };
  const issues = [
    ...validatePlacementPlan(
      acceptedPlan,
      new Map([[expected.assetId, descriptor]]),
      new Map([[candidate.candidateId, candidate]]),
      {
        allowedPolicies: ["SEMANTIC_CROP_COVER"],
        allowedImageSlotIds: [expected.target.imageSlotId],
      },
    ),
    ...validateProtectedSubjects(acceptedPlan, candidate.cropRect),
  ];
  if (issues.some((issue) => issue.severity === "ERROR"))
    fail(
      "SEMANTIC_CANDIDATE_PLAN_MISMATCH",
      "semantic candidate and plan failed Renderer validation",
    );
  return evidence;
}

export function semanticPlacementTargetFromBinding(binding: {
  readonly plumeFormatProfileId: string;
  readonly rendererFormatProfileId: string;
  readonly rendererTemplateId: string;
}): SemanticPlacementTargetEvidence {
  return {
    plumeFormatProfileId: binding.plumeFormatProfileId,
    rendererFormatProfileId: binding.rendererFormatProfileId,
    rendererTemplateId: binding.rendererTemplateId,
    imageSlotId: "IMAGE_PRIMARY",
  };
}

export const SEMANTIC_PLACEMENT_CONTRACT_VERSION = INTEGRATION_SCHEMA_VERSION;
