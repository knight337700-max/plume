import { createHash } from "node:crypto";

import {
  canonicalFreeformPlan,
  canonicalJson,
  loadFreeformFontRegistry,
  loadFreeformFormatProfileRegistry,
  validateCreativeLayoutPlan,
  type CreativeElement,
  type CreativeLayoutPlan,
  type FormatProfile,
  type FreeformFontRegistry,
  type FreeformImageElement,
  type FreeformTextElement,
  type RendererValidationIssue,
} from "@plume/renderer-vendor";
import type { AgentImageInput } from "@plume/core/src/public.js";
import { KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING } from "./renderer-bindings.js";

export const FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION = "1.0.0" as const;
export const FREEFORM_LAYOUT_EVIDENCE_METADATA_KEY = "freeformLayoutEvidence" as const;
export const FREEFORM_PLUME_FORMAT_PROFILE_ID =
  KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING.plumeFormatProfileId;
export const FREEFORM_RENDERER_FORMAT_PROFILE_ID =
  KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING.rendererFormatProfileId;
export const FREEFORM_LAYOUT_MODE = KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING.layoutMode;
export const FREEFORM_OUTPUT_MAPPING = Object.freeze({
  mimeType: "image/png",
  format: "PNG",
} as const);

export interface ConfirmedFreeformCopy {
  readonly headline: string;
  readonly subcopy: string;
}

export interface FreeformLayoutContractExpectation {
  readonly expectedRendererAssetId: string;
  readonly confirmedCopy: ConfirmedFreeformCopy;
  readonly profile?: FormatProfile;
  readonly fontRegistry?: FreeformFontRegistry;
}

export interface FreeformLayoutValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface FreeformLayoutEvidence {
  readonly schemaVersion: typeof FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION;
  readonly plumeFormatProfileId: typeof FREEFORM_PLUME_FORMAT_PROFILE_ID;
  readonly rendererFormatProfileId: typeof FREEFORM_RENDERER_FORMAT_PROFILE_ID;
  readonly creativeLayoutPlan: CreativeLayoutPlan;
  readonly creativeLayoutPlanSha256: string;
}

export interface FreeformLayoutEvidenceMetadata {
  readonly freeformLayoutEvidence: FreeformLayoutEvidence;
}

export interface FreeformPlannerImageAsset {
  readonly assetVersionId: string;
  readonly rendererAssetId: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly checksumSha256: string;
  readonly width: number;
  readonly height: number;
  readonly imageInput: AgentImageInput;
}

function issue(code: string, message: string, path?: string): FreeformLayoutValidationIssue {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function targetProfile(profile?: FormatProfile): FormatProfile {
  const loaded = loadFreeformFormatProfileRegistry();
  const target = loaded.profiles.find(
    (candidate) => candidate.formatProfileId === FREEFORM_RENDERER_FORMAT_PROFILE_ID,
  );
  if (!target) throw new Error("FREEFORM_TARGET_PROFILE_NOT_FOUND");
  if (profile && canonicalJson(profile) !== canonicalJson(target))
    throw new Error("FREEFORM_TARGET_PROFILE_REGISTRY_DRIFT");
  return target;
}

function targetFontRegistry(fontRegistry?: FreeformFontRegistry): FreeformFontRegistry {
  return fontRegistry ?? loadFreeformFontRegistry();
}

function elementTypeCounts(elements: readonly CreativeElement[]): {
  readonly images: readonly FreeformImageElement[];
  readonly texts: readonly FreeformTextElement[];
} {
  return {
    images: elements.filter((element): element is FreeformImageElement => element.type === "IMAGE"),
    texts: elements.filter((element): element is FreeformTextElement => element.type === "TEXT"),
  };
}

function scopeIssues(
  plan: CreativeLayoutPlan,
  expectation: FreeformLayoutContractExpectation,
): FreeformLayoutValidationIssue[] {
  const issues: FreeformLayoutValidationIssue[] = [];
  if (plan.formatProfileId !== FREEFORM_RENDERER_FORMAT_PROFILE_ID)
    issues.push(
      issue(
        "FREEFORM_FORMAT_PROFILE_MISMATCH",
        "CreativeLayoutPlan must target the frozen Kakao Display Native 2:1 Renderer profile",
        "/formatProfileId",
      ),
    );
  if (plan.source !== "AGENT")
    issues.push(
      issue("FREEFORM_PLAN_SOURCE_INVALID", "first-proof plan source must be AGENT", "/source"),
    );
  if (plan.background.type !== "SOLID")
    issues.push(
      issue(
        "FREEFORM_TRANSPARENT_BACKGROUND_UNSUPPORTED",
        "first-proof target requires a SOLID background",
        "/background/type",
      ),
    );
  if (plan.elements.length !== 3)
    issues.push(
      issue(
        "FREEFORM_FIRST_PROOF_ELEMENT_COUNT_INVALID",
        "first-proof plan must contain exactly three elements",
        "/elements",
      ),
    );

  const { images, texts } = elementTypeCounts(plan.elements);
  if (images.length !== 1)
    issues.push(
      issue(
        "FREEFORM_FIRST_PROOF_IMAGE_COUNT_INVALID",
        "first-proof plan must contain exactly one IMAGE element",
        "/elements",
      ),
    );
  if (texts.length !== 2)
    issues.push(
      issue(
        "FREEFORM_FIRST_PROOF_TEXT_COUNT_INVALID",
        "first-proof plan must contain exactly two TEXT elements",
        "/elements",
      ),
    );
  if (plan.elements.some((element) => element.type === "LOGO"))
    issues.push(
      issue(
        "FREEFORM_LOGO_DEFERRED",
        "LOGO is deferred beyond the first-proof contract",
        "/elements",
      ),
    );
  if (plan.elements.some((element) => element.type === "SHAPE"))
    issues.push(
      issue(
        "FREEFORM_SHAPE_UNSUPPORTED",
        "SHAPE is not part of the first-proof contract",
        "/elements",
      ),
    );

  const image = images[0];
  if (image && image.role !== "PRIMARY_IMAGE")
    issues.push(
      issue("FREEFORM_IMAGE_ROLE_INVALID", "the image must have role PRIMARY_IMAGE", "/elements"),
    );
  if (image && image.assetId !== expectation.expectedRendererAssetId)
    issues.push(
      issue(
        "FREEFORM_ASSET_ID_MISMATCH",
        "the image assetId must match the caller-provided Renderer asset identity",
        "/elements",
      ),
    );

  const headlines = texts.filter((element) => element.role === "HEADLINE");
  const subcopies = texts.filter((element) => element.role === "SUBCOPY");
  if (headlines.length !== 1)
    issues.push(
      issue(
        "FREEFORM_HEADLINE_COUNT_INVALID",
        "exactly one HEADLINE text is required",
        "/elements",
      ),
    );
  if (subcopies.length !== 1)
    issues.push(
      issue("FREEFORM_SUBCOPY_COUNT_INVALID", "exactly one SUBCOPY text is required", "/elements"),
    );
  if (headlines[0] && headlines[0].text !== expectation.confirmedCopy.headline)
    issues.push(
      issue(
        "FREEFORM_HEADLINE_COPY_MISMATCH",
        "HEADLINE text must equal confirmed copy",
        "/elements",
      ),
    );
  if (subcopies[0] && subcopies[0].text !== expectation.confirmedCopy.subcopy)
    issues.push(
      issue(
        "FREEFORM_SUBCOPY_COPY_MISMATCH",
        "SUBCOPY text must equal confirmed copy",
        "/elements",
      ),
    );
  return issues;
}

export function getKakaoDisplayNative21FormatProfile(profile?: FormatProfile): FormatProfile {
  const resolved = targetProfile(profile);
  if (
    resolved.formatProfileId !== FREEFORM_RENDERER_FORMAT_PROFILE_ID ||
    resolved.layoutMode !== FREEFORM_LAYOUT_MODE
  )
    throw new Error("FREEFORM_TARGET_PROFILE_INVALID");
  return resolved;
}

export function validateFreeformLayoutContract(
  plan: CreativeLayoutPlan,
  expectation: FreeformLayoutContractExpectation,
): readonly (RendererValidationIssue | FreeformLayoutValidationIssue)[] {
  const profile = getKakaoDisplayNative21FormatProfile(expectation.profile);
  const fontRegistry = targetFontRegistry(expectation.fontRegistry);
  const canonicalIssues = validateCreativeLayoutPlan(plan, {
    formatProfileId: FREEFORM_RENDERER_FORMAT_PROFILE_ID,
    profile,
    fontRegistry,
  });
  if (canonicalIssues.some((candidate) => candidate.severity === "ERROR")) return canonicalIssues;
  return scopeIssues(plan, expectation);
}

export function assertFreeformLayoutContract(
  plan: CreativeLayoutPlan,
  expectation: FreeformLayoutContractExpectation,
): CreativeLayoutPlan {
  const issues = validateFreeformLayoutContract(plan, expectation);
  if (issues.length > 0)
    throw new Error(
      `FREEFORM_LAYOUT_CONTRACT_INVALID:${issues.map((candidate) => candidate.code).join(",")}`,
    );
  return plan;
}

export function freeformLayoutPlanSha256(plan: CreativeLayoutPlan): string {
  return createHash("sha256").update(canonicalFreeformPlan(plan), "utf8").digest("hex");
}

export function createFreeformLayoutEvidence(
  plan: CreativeLayoutPlan,
  expectation: FreeformLayoutContractExpectation,
): FreeformLayoutEvidenceMetadata {
  assertFreeformLayoutContract(plan, expectation);
  const evidence: FreeformLayoutEvidence = {
    schemaVersion: FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION,
    plumeFormatProfileId: FREEFORM_PLUME_FORMAT_PROFILE_ID,
    rendererFormatProfileId: FREEFORM_RENDERER_FORMAT_PROFILE_ID,
    creativeLayoutPlan: plan,
    creativeLayoutPlanSha256: freeformLayoutPlanSha256(plan),
  };
  return Object.freeze({ freeformLayoutEvidence: Object.freeze(evidence) });
}

export function validateFreeformLayoutEvidence(
  value: unknown,
  expectation: FreeformLayoutContractExpectation,
): FreeformLayoutEvidenceMetadata {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !isRecord(value.freeformLayoutEvidence)
  )
    throw new Error("FREEFORM_LAYOUT_EVIDENCE_INVALID");
  const raw = value.freeformLayoutEvidence;
  const allowed = new Set([
    "schemaVersion",
    "plumeFormatProfileId",
    "rendererFormatProfileId",
    "creativeLayoutPlan",
    "creativeLayoutPlanSha256",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key)))
    throw new Error("FREEFORM_LAYOUT_EVIDENCE_UNKNOWN_PROPERTY");
  if (
    raw.schemaVersion !== FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION ||
    raw.plumeFormatProfileId !== FREEFORM_PLUME_FORMAT_PROFILE_ID ||
    raw.rendererFormatProfileId !== FREEFORM_RENDERER_FORMAT_PROFILE_ID ||
    !isRecord(raw.creativeLayoutPlan) ||
    typeof raw.creativeLayoutPlanSha256 !== "string"
  )
    throw new Error("FREEFORM_LAYOUT_EVIDENCE_IDENTITY_INVALID");
  const plan = raw.creativeLayoutPlan as unknown as CreativeLayoutPlan;
  if (raw.creativeLayoutPlanSha256 !== freeformLayoutPlanSha256(plan))
    throw new Error("FREEFORM_LAYOUT_EVIDENCE_HASH_MISMATCH");
  assertFreeformLayoutContract(plan, expectation);
  return value as unknown as FreeformLayoutEvidenceMetadata;
}
