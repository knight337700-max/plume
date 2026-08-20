import canonicalize from "canonicalize";

import {
  validateCreativeLayoutPlan,
  type CreativeLayoutPlan,
  type LayoutMode,
} from "./freeform.js";

export * from "./freeform.js";
export * from "./capability.js";
export * from "./multi-artifact.js";
export * from "./google-static.js";

export const INTEGRATION_SCHEMA_VERSION = "1.8.0" as const;
export const PREVIOUS_INTEGRATION_SCHEMA_VERSION = "1.7.0" as const;
export const LEGACY_INTEGRATION_SCHEMA_VERSION = "1.2.0" as const;
export const EARLY_LEGACY_INTEGRATION_SCHEMA_VERSION = "1.1.0" as const;
export type IntegrationSchemaVersion = typeof INTEGRATION_SCHEMA_VERSION | typeof PREVIOUS_INTEGRATION_SCHEMA_VERSION | "1.6.0" | "1.5.0" | "1.4.0" | "1.3.0" | typeof LEGACY_INTEGRATION_SCHEMA_VERSION | typeof EARLY_LEGACY_INTEGRATION_SCHEMA_VERSION;
export const NORMALIZED_EPSILON = 1e-9;
export const OBJECT_RIGHT_FORMAT_PROFILE_ID = "KAKAO_BIZBOARD_OBJECT_RIGHT" as const;
export const OBJECT_RIGHT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1" as const;
export const OBJECT_RIGHT_IMAGE_SLOT_ID = "OBJECT_RIGHT_PRODUCT" as const;
export const THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID = "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT" as const;
export const THUMBNAIL_BOX_RIGHT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT" as const;
export const THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID = "IMAGE_PRIMARY" as const;
export const THUMBNAIL_MULTI_RIGHT_FORMAT_PROFILE_ID = "KAKAO_BIZBOARD_THUMBNAIL_MULTI_RIGHT" as const;
export const THUMBNAIL_MULTI_RIGHT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_MULTI_RIGHT" as const;
export const THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID = "IMAGE_PRIMARY" as const;
export const THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID = "IMAGE_SECONDARY" as const;
export const THUMBNAIL_MULTI_RIGHT_IMAGE_SLOT_IDS = [
  THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID,
  THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID,
] as const;
export const MASK_SEMICIRCLE_RIGHT_FORMAT_PROFILE_ID = "KAKAO_BIZBOARD_MASK_SEMICIRCLE_RIGHT" as const;
export const MASK_SEMICIRCLE_RIGHT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_MASK_SEMICIRCLE_RIGHT" as const;
export const MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID = "IMAGE_PRIMARY" as const;
export const MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID = "LOGO_PRIMARY" as const;
export const MASK_SEMICIRCLE_RIGHT_SLOT_IDS = [MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID] as const;
export const MASK_SEMICIRCLE_RIGHT_MASK_ASSET_ID = "KAKAO_BIZBOARD_MASK_SEMICIRCLE_RIGHT_V1" as const;
export const MASK_SEMICIRCLE_RIGHT_MASK_ASSET_PATH = "assets/masks/kakao-bizboard-mask-semicircle-right-v1.png" as const;
export const MASK_SEMICIRCLE_RIGHT_MASK_ASSET_SHA256 = "eb9ea4859e2b75384ac814add59ce9636ce865ad5bae5a33f76d46210bfa6027" as const;

export type SupportedInputMimeType = "image/png" | "image/jpeg";
export type RendererImageMimeType = SupportedInputMimeType;
export type AssetRefType = "DESKTOP_ASSET_TOKEN" | "INTEGRATION_ASSET_TOKEN" | "FIXTURE_ASSET_ID";
export type ImagePlacementPolicy = "ALPHA_TRIM_CONTAIN" | "CENTER_CONTAIN" | "SEMANTIC_CROP_COVER" | "MANUAL_CROP";
export type ImageFitMode = "CONTAIN" | "COVER";
export type ImageAnchor =
  | "CENTER"
  | "CENTER_LEFT"
  | "CENTER_RIGHT"
  | "TOP_CENTER"
  | "TOP_LEFT"
  | "TOP_RIGHT"
  | "BOTTOM_CENTER"
  | "BOTTOM_LEFT"
  | "BOTTOM_RIGHT";
export type SubjectProtection = "REQUIRED" | "PREFERRED" | "NONE";
export type PlacementPlanSource = "DETERMINISTIC" | "MANUAL" | "AGENT" | "SAVED_CREATIVE";
export type ValidationSeverity = "INFO" | "WARNING" | "ERROR";
export type VisualSlotRole = "IMAGE" | "LOGO";

export type NormalizedPoint = Readonly<{ x: number; y: number }>;
export type NormalizedRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type PixelRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type RendererAssetAnalysis = Readonly<{
  alphaChannel?: boolean;
  alphaBounds?: NormalizedRect;
  focalPoint?: NormalizedPoint;
  protectedSubjects?: readonly ProtectedSubject[];
}>;

export type RendererAssetDescriptor = Readonly<{
  assetId: string;
  mimeType: RendererImageMimeType;
  declaredWidth?: number;
  declaredHeight?: number;
  checksumSha256?: string;
  assetRef: Readonly<{ type: AssetRefType; value: string }>;
  analysis?: RendererAssetAnalysis;
}>;

export type ProtectedSubject = Readonly<{
  subjectId: string;
  subjectType: "PRODUCT" | "PERSON" | "FACE" | "LOGO" | "TEXT" | "OTHER";
  bounds: NormalizedRect;
}>;

export type ImagePlacementPlan = Readonly<{
  schemaVersion: IntegrationSchemaVersion;
  imageSlotId: string;
  assetId: string;
  policy: ImagePlacementPolicy;
  source: PlacementPlanSource;
  fitMode: ImageFitMode;
  cropRect?: NormalizedRect;
  focalPoint?: NormalizedPoint;
  anchor: ImageAnchor;
  subjectProtection: SubjectProtection;
  cropCandidateId?: string;
  confidence?: number;
  protectedSubjects?: readonly ProtectedSubject[];
  rationale?: string;
}>;

export type CropCandidate = Readonly<{
  schemaVersion: IntegrationSchemaVersion;
  candidateId: string;
  assetId: string;
  imageSlotId: string;
  cropRect: NormalizedRect;
  focalPoint?: NormalizedPoint;
  preservedSubjectIds: readonly string[];
  clippedSubjectIds: readonly string[];
  fillRatio: number;
  subjectCoverageRatio: number;
  warnings: readonly string[];
}>;

export type RendererCopyInput = Readonly<{
  advertiser?: string;
  headline?: string;
  subcopy?: string;
  cta?: string;
  slots?: Readonly<Record<string, string>>;
}>;

export type RendererOutputRequest = Readonly<{
  mimeType: "image/png" | "image/jpeg";
  format?: "PNG" | "JPEG";
  quality?: number | "AUTO_FIT";
}>;

export type RendererIntegrationInputV1 = Readonly<{
  schemaVersion: IntegrationSchemaVersion;
  formatProfileId: string;
  templateId: string;
  copy: RendererCopyInput;
  assets: readonly RendererAssetDescriptor[];
  imagePlacementPlans: readonly ImagePlacementPlan[];
  cropCandidates?: readonly CropCandidate[];
  output: RendererOutputRequest;
  layoutMode?: LayoutMode;
  creativeLayoutPlan?: CreativeLayoutPlan;
}>;

export type RendererFreeformIntegrationInputV1 = Readonly<{
  schemaVersion: IntegrationSchemaVersion;
  formatProfileId: string;
  layoutMode: "FREEFORM";
  creativeLayoutPlan: CreativeLayoutPlan;
  output: RendererOutputRequest;
}>;

export type RendererValidationIssue = Readonly<{
  code: string;
  severity: ValidationSeverity;
  messageKey: string;
  message?: string;
  path?: string;
  imageSlotId?: string;
  slotRole?: VisualSlotRole;
  assetId?: string;
  elementId?: string;
  actual?: unknown;
  expected?: unknown;
}>;

export type AppliedImagePlacement = Readonly<{
  imageSlotId: string;
  slotRole?: VisualSlotRole;
  assetId: string;
  policy: ImagePlacementPolicy;
  source: PlacementPlanSource;
  requestedCropRect?: NormalizedRect;
  resolvedSourceCropRect?: NormalizedRect;
  resolvedSourceCropPixels?: PixelRect;
  destinationRect: PixelRect;
  appliedScale: number;
  appliedAnchor: ImageAnchor;
  alphaTrimApplied: boolean;
  alphaBounds?: NormalizedRect;
  maskAssetId?: string;
  maskDigest?: string;
  cropCandidateId?: string;
  changedFromRequestedPlan: false;
}>;

export type RendererIntegrationOutputV1 = Readonly<{
  schemaVersion: typeof INTEGRATION_SCHEMA_VERSION;
  status: "PASS" | "BLOCKED";
  artifact?: Readonly<{
    mimeType: "image/png" | "image/jpeg";
    width: number;
    height: number;
    bytes: number;
    checksumSha256: string;
  }>;
  appliedImagePlacements: readonly AppliedImagePlacement[];
  validation: Readonly<{
    errors: readonly RendererValidationIssue[];
    warnings: readonly RendererValidationIssue[];
    info: readonly RendererValidationIssue[];
  }>;
  requestFingerprint: string;
  pixelFingerprint: string;
  renderFingerprint: string;
}>;

export type ImplementationStatus = "NOT_IMPLEMENTED" | "PARTIAL" | "IMPLEMENTED" | "CONTRACT_BLOCKED_VARIABLE_CANVAS";
export type SemanticPlacement = "NOT_REQUIRED" | "OPTIONAL" | "REQUIRED";
export type ImagePlacementCapability = Readonly<{
  schemaVersion: typeof INTEGRATION_SCHEMA_VERSION;
  /** Additive N1A namespace metadata; legacy capability consumers may ignore it. */
  channelNamespace?: import("./capability.js").ChannelId;
  placement?: string;
  compositionMode?: import("./capability.js").CompositionMode;
  layoutMode?: LayoutMode;
  artifactCardinality?: import("./capability.js").ArtifactCardinality;
  implementationStatus: ImplementationStatus;
  defaultPolicy: ImagePlacementPolicy;
  semanticPlacement: SemanticPlacement;
  allowedPolicies: readonly ImagePlacementPolicy[];
  supportsManualCrop: boolean;
  supportsAgentPlacement: boolean;
  imageSlotIds?: readonly string[];
  allowedInputMimeTypes: readonly SupportedInputMimeType[];
  alphaChannelRequired: boolean;
  minimumAssets?: number;
  maximumAssets?: number;
  requiredPlacementPlans?: number;
  slotCapabilities?: readonly SlotCapability[];
}>;

export type SlotCapability = Readonly<{
  slotId: string;
  slotRole: VisualSlotRole;
  required: boolean;
  allowedInputMimeTypes: readonly SupportedInputMimeType[];
  allowedPolicies: readonly ImagePlacementPolicy[];
  alphaChannelRequired: boolean;
  colorRestriction?: "NONE";
  supportsManualCrop: boolean;
  supportsAgentPlacement: boolean;
}>;

export type AssetResolverResult = Readonly<{
  bytes: Uint8Array;
  resolvedMimeType: string;
  metadata?: Readonly<{
    detectedMimeType: SupportedInputMimeType;
    width: number;
    height: number;
    hasAlpha: boolean;
    exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  }>;
}>;
export interface RendererAssetResolver {
  resolve(assetRef: RendererAssetDescriptor["assetRef"]): Promise<AssetResolverResult>;
}

export type ContractValidationContext = Readonly<{
  allowedPolicies?: readonly ImagePlacementPolicy[];
  requiredImageSlotIds?: readonly string[];
  allowedImageSlotIds?: readonly string[];
  allowedInputMimeTypes?: readonly SupportedInputMimeType[];
  alphaChannelRequired?: boolean;
  unusedAssetSeverity?: "WARNING" | "ERROR";
  slotCapabilities?: readonly SlotCapability[];
}>;

const severityOrder: Record<ValidationSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

export function issue(
  code: string,
  severity: ValidationSeverity,
  messageKey: string,
  details: Omit<RendererValidationIssue, "code" | "severity" | "messageKey"> = {},
): RendererValidationIssue {
  return { code, severity, messageKey, ...details };
}

export function sortIssues(issues: readonly RendererValidationIssue[]): RendererValidationIssue[] {
  const slotOrder = new Map<string, number>([
    [OBJECT_RIGHT_IMAGE_SLOT_ID, 0],
    [THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID, 0],
    [THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID, 1],
    [MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, 0],
    [MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, 1],
  ]);
  return [...issues].sort((a, b) => {
    const severity = severityOrder[a.severity] - severityOrder[b.severity];
    if (severity !== 0) return severity;
    const path = (a.path ?? "").localeCompare(b.path ?? "");
    if (path !== 0) return path;
    const slot = (slotOrder.get(a.imageSlotId ?? "") ?? Number.MAX_SAFE_INTEGER) - (slotOrder.get(b.imageSlotId ?? "") ?? Number.MAX_SAFE_INTEGER);
    if (slot !== 0) return slot;
    const code = a.code.localeCompare(b.code);
    if (code !== 0) return code;
    return a.messageKey.localeCompare(b.messageKey);
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSupportedIntegrationSchemaVersion(value: unknown): value is IntegrationSchemaVersion {
  return value === INTEGRATION_SCHEMA_VERSION || value === PREVIOUS_INTEGRATION_SCHEMA_VERSION || value === "1.6.0" || value === "1.5.0" || value === "1.4.0" || value === "1.3.0" || value === LEGACY_INTEGRATION_SCHEMA_VERSION || value === EARLY_LEGACY_INTEGRATION_SCHEMA_VERSION;
}

export function validateNormalizedPoint(value: unknown, path = ""): RendererValidationIssue[] {
  const errors: RendererValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return [issue("KBR-FOCAL-POINT-OUT-OF-BOUNDS", "ERROR", "placement.focal_point_invalid", { path })];
  }
  const point = value as Partial<NormalizedPoint>;
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y) || point.x < -NORMALIZED_EPSILON || point.x > 1 + NORMALIZED_EPSILON || point.y < -NORMALIZED_EPSILON || point.y > 1 + NORMALIZED_EPSILON) {
    errors.push(issue("KBR-FOCAL-POINT-OUT-OF-BOUNDS", "ERROR", "placement.focal_point_out_of_bounds", { path }));
  }
  return errors;
}

export function validateNormalizedRect(value: unknown, path = ""): RendererValidationIssue[] {
  const errors: RendererValidationIssue[] = [];
  if (!value || typeof value !== "object") {
    return [issue("KBR-CROP-RECT-OUT-OF-BOUNDS", "ERROR", "placement.crop_rect_invalid", { path })];
  }
  const rect = value as Partial<NormalizedRect>;
  const validNumbers = [rect.x, rect.y, rect.width, rect.height].every(isFiniteNumber);
  const inBounds = validNumbers && rect.x! >= -NORMALIZED_EPSILON && rect.y! >= -NORMALIZED_EPSILON && rect.width! > 0 && rect.height! > 0 && rect.width! <= 1 + NORMALIZED_EPSILON && rect.height! <= 1 + NORMALIZED_EPSILON && rect.x! + rect.width! <= 1 + NORMALIZED_EPSILON && rect.y! + rect.height! <= 1 + NORMALIZED_EPSILON;
  if (!inBounds) errors.push(issue("KBR-CROP-RECT-OUT-OF-BOUNDS", "ERROR", "placement.crop_rect_out_of_bounds", { path }));
  return errors;
}

export function normalizedRectToPixelRect(rect: NormalizedRect, sourceWidth: number, sourceHeight: number): PixelRect {
  const validation = validateNormalizedRect(rect);
  if (!isFiniteNumber(sourceWidth) || !isFiniteNumber(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0 || validation.length > 0) {
    throw new RangeError("Normalized rect or source dimensions are invalid");
  }
  const left = Math.floor(rect.x * sourceWidth);
  const top = Math.floor(rect.y * sourceHeight);
  const right = Math.ceil((rect.x + rect.width) * sourceWidth);
  const bottom = Math.ceil((rect.y + rect.height) * sourceHeight);
  if (left < 0 || top < 0 || right > sourceWidth || bottom > sourceHeight || right <= left || bottom <= top) {
    throw new RangeError("Normalized rect exceeds source bounds");
  }
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

const policyFit: Record<ImagePlacementPolicy, ImageFitMode> = {
  ALPHA_TRIM_CONTAIN: "CONTAIN",
  CENTER_CONTAIN: "CONTAIN",
  SEMANTIC_CROP_COVER: "COVER",
  MANUAL_CROP: "COVER",
};

export function validatePlacementPlan(
  plan: ImagePlacementPlan,
  assets: ReadonlyMap<string, RendererAssetDescriptor>,
  candidates: ReadonlyMap<string, CropCandidate>,
  context: ContractValidationContext = {},
): RendererValidationIssue[] {
  const errors: RendererValidationIssue[] = [];
  const path = `/imagePlacementPlans/${plan.imageSlotId}`;
  const slotCapability = context.slotCapabilities?.find((entry) => entry.slotId === plan.imageSlotId);
  if (!assets.has(plan.assetId)) errors.push(issue(slotCapability?.slotRole === "LOGO" ? "KBR-LOGO-ASSET-MISSING" : "KBR-ASSET-NOT-FOUND", "ERROR", slotCapability?.slotRole === "LOGO" ? "asset.logo_missing" : "asset.not_found", { path: `${path}/assetId`, assetId: plan.assetId, ...(slotCapability?.slotRole ? { slotRole: slotCapability.slotRole } : {}) }));
  if (context.allowedImageSlotIds && !context.allowedImageSlotIds.includes(plan.imageSlotId)) errors.push(issue("KBR-IMAGE-SLOT-NOT-FOUND", "ERROR", "placement.image_slot_not_found", { path: `${path}/imageSlotId`, imageSlotId: plan.imageSlotId }));
  if (!slotCapability && context.allowedPolicies && !context.allowedPolicies.includes(plan.policy)) errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.policy_not_allowed", { path: `${path}/policy`, actual: plan.policy, expected: context.allowedPolicies }));
  if (slotCapability && !slotCapability.allowedPolicies.includes(plan.policy)) errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.slot_policy_not_allowed", { path: `${path}/policy`, imageSlotId: plan.imageSlotId, slotRole: slotCapability.slotRole, actual: plan.policy, expected: slotCapability.allowedPolicies }));
  if (policyFit[plan.policy] !== plan.fitMode) errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.fit_mode_not_allowed", { path: `${path}/fitMode`, actual: plan.fitMode, expected: policyFit[plan.policy] }));
  if (plan.confidence !== undefined && (!isFiniteNumber(plan.confidence) || plan.confidence < 0 || plan.confidence > 1)) errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.confidence_invalid", { path: `${path}/confidence` }));
  errors.push(...validateNormalizedRectList(plan.protectedSubjects, `${path}/protectedSubjects`));
  if (plan.focalPoint) errors.push(...validateNormalizedPoint(plan.focalPoint, `${path}/focalPoint`));
  if (plan.cropRect) errors.push(...validateNormalizedRect(plan.cropRect, `${path}/cropRect`));

  const hasCrop = plan.cropRect !== undefined;
  const hasCandidate = plan.cropCandidateId !== undefined;
  if (hasCrop && hasCandidate) errors.push(issue("KBR-CROP-RECT-FORBIDDEN", "ERROR", "placement.crop_and_candidate_mutually_exclusive", { path }));
  if ((plan.policy === "ALPHA_TRIM_CONTAIN" || plan.policy === "CENTER_CONTAIN") && (hasCrop || hasCandidate)) {
    errors.push(issue("KBR-CROP-RECT-FORBIDDEN", "ERROR", "placement.crop_forbidden_for_policy", { path }));
  }
  if (plan.policy === "SEMANTIC_CROP_COVER" && !hasCrop && !hasCandidate) errors.push(issue("KBR-CROP-RECT-REQUIRED", "ERROR", "placement.semantic_crop_required", { path }));
  if (plan.policy === "MANUAL_CROP" && !hasCrop) errors.push(issue("KBR-CROP-RECT-REQUIRED", "ERROR", "placement.manual_crop_required", { path }));
  if (plan.policy === "MANUAL_CROP" && hasCandidate) errors.push(issue("KBR-CROP-CANDIDATE-MISMATCH", "ERROR", "placement.manual_candidate_forbidden", { path }));
  if (plan.policy === "MANUAL_CROP" && plan.source !== "MANUAL") errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.manual_source_required", { path: `${path}/source`, actual: plan.source, expected: "MANUAL" }));
  if (slotCapability?.slotRole === "LOGO") {
    if (plan.source !== "DETERMINISTIC") errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.logo_source_must_be_deterministic", { path: `${path}/source`, slotRole: "LOGO", actual: plan.source, expected: "DETERMINISTIC" }));
    if (plan.anchor !== "CENTER") errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.logo_anchor_must_be_center", { path: `${path}/anchor`, slotRole: "LOGO", actual: plan.anchor, expected: "CENTER" }));
    if (plan.cropRect !== undefined) errors.push(issue("KBR-CROP-RECT-FORBIDDEN", "ERROR", "placement.logo_crop_forbidden", { path: `${path}/cropRect`, imageSlotId: plan.imageSlotId, slotRole: "LOGO" }));
    if (plan.cropCandidateId !== undefined) errors.push(issue("KBR-CROP-CANDIDATE-MISMATCH", "ERROR", "placement.logo_candidate_forbidden", { path: `${path}/cropCandidateId`, imageSlotId: plan.imageSlotId, slotRole: "LOGO" }));
    if (plan.focalPoint !== undefined) errors.push(issue("KBR-PLACEMENT-POLICY-NOT-ALLOWED", "ERROR", "placement.logo_focal_point_forbidden", { path: `${path}/focalPoint`, imageSlotId: plan.imageSlotId, slotRole: "LOGO" }));
  }
  if (hasCandidate) {
    const candidate = candidates.get(plan.cropCandidateId!);
    if (!candidate) errors.push(issue("KBR-CROP-CANDIDATE-NOT-FOUND", "ERROR", "placement.crop_candidate_not_found", { path: `${path}/cropCandidateId`, actual: plan.cropCandidateId }));
    else {
      errors.push(...validateNormalizedRect(candidate.cropRect, `${path}/cropCandidateId`));
      if (candidate.assetId !== plan.assetId || candidate.imageSlotId !== plan.imageSlotId) errors.push(issue("KBR-CROP-CANDIDATE-MISMATCH", "ERROR", "placement.crop_candidate_mismatch", { path: `${path}/cropCandidateId`, actual: { assetId: candidate.assetId, imageSlotId: candidate.imageSlotId }, expected: { assetId: plan.assetId, imageSlotId: plan.imageSlotId } }));
      if (!isFiniteNumber(candidate.fillRatio) || candidate.fillRatio < 0 || candidate.fillRatio > 1 || !isFiniteNumber(candidate.subjectCoverageRatio) || candidate.subjectCoverageRatio < 0 || candidate.subjectCoverageRatio > 1) errors.push(issue("KBR-CROP-CANDIDATE-MISMATCH", "ERROR", "placement.crop_candidate_ratio_invalid", { path: `${path}/cropCandidateId` }));
    }
  }
  if (plan.subjectProtection === "REQUIRED" && (!plan.protectedSubjects || plan.protectedSubjects.length === 0)) errors.push(issue("KBR-PROTECTED-SUBJECT-DATA-MISSING", "ERROR", "placement.protected_subject_data_missing", { path: `${path}/protectedSubjects` }));
  return errors;
}

function validateNormalizedRectList(subjects: readonly ProtectedSubject[] | undefined, path: string): RendererValidationIssue[] {
  if (!subjects) return [];
  return subjects.flatMap((subject, index) => validateNormalizedRect(subject.bounds, `${path}/${index}/bounds`));
}

export function validateProtectedSubjects(
  plan: ImagePlacementPlan,
  cropRect: NormalizedRect | undefined,
): RendererValidationIssue[] {
  if (!cropRect || plan.subjectProtection === "NONE" || !plan.protectedSubjects?.length) return [];
  const issues: RendererValidationIssue[] = [];
  for (const [index, subject] of plan.protectedSubjects.entries()) {
    const outside = subject.bounds.x < cropRect.x - NORMALIZED_EPSILON || subject.bounds.y < cropRect.y - NORMALIZED_EPSILON || subject.bounds.x + subject.bounds.width > cropRect.x + cropRect.width + NORMALIZED_EPSILON || subject.bounds.y + subject.bounds.height > cropRect.y + cropRect.height + NORMALIZED_EPSILON;
    if (outside) issues.push(issue("KBR-PROTECTED-SUBJECT-CLIPPED", plan.subjectProtection === "REQUIRED" ? "ERROR" : "WARNING", "placement.protected_subject_clipped", { path: `/imagePlacementPlans/${plan.imageSlotId}/protectedSubjects/${index}`, imageSlotId: plan.imageSlotId }));
  }
  return issues;
}

export function resolveCropRect(plan: ImagePlacementPlan, candidates: ReadonlyMap<string, CropCandidate>): NormalizedRect | undefined {
  if (plan.cropRect) return plan.cropRect;
  if (plan.cropCandidateId) return candidates.get(plan.cropCandidateId)?.cropRect;
  return undefined;
}

export function validateIntegrationInput(input: RendererIntegrationInputV1, context: ContractValidationContext = {}): RendererValidationIssue[] {
  const errors: RendererValidationIssue[] = [];
  const layoutMode = input.layoutMode ?? "TEMPLATE_LOCKED";
  if (layoutMode === "FREEFORM") {
    if (!input.creativeLayoutPlan) return [issue("KBR-FREEFORM-PLAN-MISSING", "ERROR", "freeform.plan_missing", { path: "/creativeLayoutPlan" })];
    return sortIssues(validateCreativeLayoutPlan(input.creativeLayoutPlan, { formatProfileId: input.formatProfileId }));
  }
  if (input.creativeLayoutPlan !== undefined) errors.push(issue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "ERROR", "freeform.plan_requires_freeform_mode", { path: "/creativeLayoutPlan", expected: "layoutMode=FREEFORM" }));
  if (!isSupportedIntegrationSchemaVersion(input.schemaVersion)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.schema_version_invalid", { path: "/schemaVersion", expected: INTEGRATION_SCHEMA_VERSION, actual: input.schemaVersion }));
  if (!input.formatProfileId) errors.push(issue("KBR-INPUT-002", "ERROR", "input.format_profile_missing", { path: "/formatProfileId" }));
  if (!input.templateId) errors.push(issue("KBR-INPUT-002", "ERROR", "input.template_id_missing", { path: "/templateId" }));
  const assets = new Map<string, RendererAssetDescriptor>();
  for (const [index, asset] of input.assets.entries()) {
    if (assets.has(asset.assetId)) errors.push(issue("KBR-ASSET-NOT-FOUND", "ERROR", "asset.duplicate_id", { path: `/assets/${index}/assetId`, assetId: asset.assetId }));
    assets.set(asset.assetId, asset);
    if (context.allowedInputMimeTypes && !context.allowedInputMimeTypes.includes(asset.mimeType)) errors.push(issue("KBR-ASSET-MIME-NOT-ALLOWED", "ERROR", "asset.mime_not_allowed", { path: `/assets/${index}/mimeType`, assetId: asset.assetId, actual: asset.mimeType, expected: context.allowedInputMimeTypes }));
    const refValue = asset.assetRef.value;
    const absoluteRef = refValue.includes("\0") || /^[a-zA-Z]:[\\/]/u.test(refValue) || refValue.startsWith("/") || refValue.startsWith("\\\\") || refValue.split(/[\\/]+/u).includes("..");
    if (absoluteRef) errors.push(issue("KBR-ASSET-REF-UNRESOLVED", "ERROR", "asset.ref_must_be_serializable_token", { path: `/assets/${index}/assetRef/value`, actual: refValue }));
    if (asset.declaredWidth !== undefined && (!Number.isInteger(asset.declaredWidth) || asset.declaredWidth <= 0)) errors.push(issue("KBR-ASSET-DIMENSION-MISMATCH", "ERROR", "asset.declared_dimension_invalid", { path: `/assets/${index}/declaredWidth` }));
    if (asset.declaredHeight !== undefined && (!Number.isInteger(asset.declaredHeight) || asset.declaredHeight <= 0)) errors.push(issue("KBR-ASSET-DIMENSION-MISMATCH", "ERROR", "asset.declared_dimension_invalid", { path: `/assets/${index}/declaredHeight` }));
  }
  const candidates = new Map<string, CropCandidate>();
  for (const [index, candidate] of (input.cropCandidates ?? []).entries()) {
    if (candidates.has(candidate.candidateId)) errors.push(issue("KBR-CROP-CANDIDATE-MISMATCH", "ERROR", "placement.duplicate_candidate_id", { path: `/cropCandidates/${index}/candidateId` }));
    candidates.set(candidate.candidateId, candidate);
  }
  const plansBySlot = new Map<string, ImagePlacementPlan>();
  for (const [index, plan] of input.imagePlacementPlans.entries()) {
    if (plansBySlot.has(plan.imageSlotId)) errors.push(issue("KBR-PLACEMENT-PLAN-DUPLICATE", "ERROR", "placement.plan_duplicate", { path: `/imagePlacementPlans/${index}/imageSlotId`, imageSlotId: plan.imageSlotId }));
    plansBySlot.set(plan.imageSlotId, plan);
    errors.push(...validatePlacementPlan(plan, assets, candidates, context));
    const slotCapability = context.slotCapabilities?.find((entry) => entry.slotId === plan.imageSlotId);
    const asset = assets.get(plan.assetId);
    if (slotCapability && asset && !slotCapability.allowedInputMimeTypes.includes(asset.mimeType)) errors.push(issue("KBR-ASSET-MIME-NOT-ALLOWED", "ERROR", "asset.slot_mime_not_allowed", { path: `/imagePlacementPlans/${plan.imageSlotId}/assetId`, imageSlotId: plan.imageSlotId, slotRole: slotCapability.slotRole, assetId: plan.assetId, actual: asset.mimeType, expected: slotCapability.allowedInputMimeTypes }));
    errors.push(...validateProtectedSubjects(plan, resolveCropRect(plan, candidates)));
  }
  for (const slot of context.requiredImageSlotIds ?? []) {
    if (plansBySlot.has(slot)) continue;
    const slotCapability = context.slotCapabilities?.find((entry) => entry.slotId === slot);
    errors.push(issue(slotCapability?.slotRole === "LOGO" ? "KBR-LOGO-PLAN-MISSING" : "KBR-PLACEMENT-PLAN-MISSING", "ERROR", slotCapability?.slotRole === "LOGO" ? "placement.logo_plan_missing" : "placement.plan_missing", { path: "/imagePlacementPlans", imageSlotId: slot, ...(slotCapability?.slotRole ? { slotRole: slotCapability.slotRole } : {}) }));
  }
  const usedAssets = new Set(input.imagePlacementPlans.map((plan) => plan.assetId));
  for (const asset of input.assets) if (!usedAssets.has(asset.assetId)) errors.push(issue("KBR-ASSET-UNUSED", context.unusedAssetSeverity ?? "WARNING", "asset.unused", { path: "/assets", assetId: asset.assetId }));
  if (input.output.mimeType !== "image/png") errors.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.mime_type_not_implemented", { path: "/output/mimeType", actual: input.output.mimeType, expected: "image/png" }));
  if (input.output.quality !== undefined && (!isFiniteNumber(input.output.quality) || input.output.quality < 0 || input.output.quality > 100)) errors.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.quality_invalid", { path: "/output/quality" }));
  return sortIssues(errors);
}

export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) throw new TypeError("Value is not JSON-serializable");
  return result;
}

export function serializePlacementPlan(plan: ImagePlacementPlan): string {
  return canonicalJson(plan);
}

export function parsePlacementPlan(value: unknown): { plan: ImagePlacementPlan | null; errors: RendererValidationIssue[] } {
  if (!value || typeof value !== "object") return { plan: null, errors: [issue("KBR-INPUT-002", "ERROR", "input.schema_mismatch", { path: "" })] };
  const candidate = value as Partial<ImagePlacementPlan>;
  const errors: RendererValidationIssue[] = [];
  const allowed = new Set(["schemaVersion", "imageSlotId", "assetId", "policy", "source", "fitMode", "cropRect", "focalPoint", "anchor", "subjectProtection", "cropCandidateId", "confidence", "protectedSubjects", "rationale"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.additional_property", { path: `/${key}` }));
  if (!isSupportedIntegrationSchemaVersion(candidate.schemaVersion)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.schema_version_invalid", { path: "/schemaVersion", expected: INTEGRATION_SCHEMA_VERSION }));
  if (typeof candidate.imageSlotId !== "string" || !candidate.imageSlotId) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/imageSlotId" }));
  if (typeof candidate.assetId !== "string" || !candidate.assetId) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/assetId" }));
  if (!candidate.policy || !["ALPHA_TRIM_CONTAIN", "CENTER_CONTAIN", "SEMANTIC_CROP_COVER", "MANUAL_CROP"].includes(candidate.policy)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: "/policy" }));
  if (!candidate.source || !["DETERMINISTIC", "MANUAL", "AGENT", "SAVED_CREATIVE"].includes(candidate.source)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: "/source" }));
  if (!candidate.fitMode || !["CONTAIN", "COVER"].includes(candidate.fitMode)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: "/fitMode" }));
  if (!candidate.anchor || !["CENTER", "CENTER_LEFT", "CENTER_RIGHT", "TOP_CENTER", "TOP_LEFT", "TOP_RIGHT", "BOTTOM_CENTER", "BOTTOM_LEFT", "BOTTOM_RIGHT"].includes(candidate.anchor)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: "/anchor" }));
  if (!candidate.subjectProtection || !["REQUIRED", "PREFERRED", "NONE"].includes(candidate.subjectProtection)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: "/subjectProtection" }));
  if (candidate.cropRect !== undefined) {
    if (!candidate.cropRect || typeof candidate.cropRect !== "object") errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/cropRect" }));
    else {
      for (const key of Object.keys(candidate.cropRect)) if (!["x", "y", "width", "height"].includes(key)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.additional_property", { path: `/cropRect/${key}` }));
      for (const key of ["x", "y", "width", "height"] as const) if (!isFiniteNumber(candidate.cropRect[key])) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: `/cropRect/${key}` }));
    }
  }
  if (candidate.focalPoint !== undefined) {
    if (!candidate.focalPoint || typeof candidate.focalPoint !== "object") errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/focalPoint" }));
    else {
      for (const key of Object.keys(candidate.focalPoint)) if (!["x", "y"].includes(key)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.additional_property", { path: `/focalPoint/${key}` }));
      if (!isFiniteNumber(candidate.focalPoint.x)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/focalPoint/x" }));
      if (!isFiniteNumber(candidate.focalPoint.y)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/focalPoint/y" }));
    }
  }
  if (candidate.protectedSubjects !== undefined) {
    if (!Array.isArray(candidate.protectedSubjects)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: "/protectedSubjects" }));
    else for (const [index, subject] of candidate.protectedSubjects.entries()) {
      if (!subject || typeof subject !== "object") errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: `/protectedSubjects/${index}` }));
      else {
        for (const key of Object.keys(subject)) if (!["subjectId", "subjectType", "bounds"].includes(key)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.additional_property", { path: `/protectedSubjects/${index}/${key}` }));
        if (typeof subject.subjectId !== "string" || !subject.subjectId) errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: `/protectedSubjects/${index}/subjectId` }));
        if (!["PRODUCT", "PERSON", "FACE", "LOGO", "TEXT", "OTHER"].includes(subject.subjectType as string)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.enum_invalid", { path: `/protectedSubjects/${index}/subjectType` }));
        if (!subject.bounds || typeof subject.bounds !== "object") errors.push(issue("KBR-INPUT-002", "ERROR", "input.type_invalid", { path: `/protectedSubjects/${index}/bounds` }));
        else for (const key of Object.keys(subject.bounds)) if (!["x", "y", "width", "height"].includes(key)) errors.push(issue("KBR-INPUT-002", "ERROR", "input.additional_property", { path: `/protectedSubjects/${index}/bounds/${key}` }));
      }
    }
  }
  if (errors.length > 0) return { plan: null, errors: sortIssues(errors) };
  return { plan: candidate as ImagePlacementPlan, errors: [] };
}

export const CAPABILITIES: Readonly<Record<string, ImagePlacementCapability>> = Object.freeze({
  KAKAO_BIZBOARD_OBJECT_RIGHT: Object.freeze({ schemaVersion: INTEGRATION_SCHEMA_VERSION, channelNamespace: "KAKAO_MOMENT", placement: "BIZBOARD_OBJECT_RIGHT", compositionMode: "RENDERER_COMPOSED", layoutMode: "TEMPLATE_LOCKED", artifactCardinality: "SINGLE", implementationStatus: "IMPLEMENTED", defaultPolicy: "ALPHA_TRIM_CONTAIN", semanticPlacement: "NOT_REQUIRED", allowedPolicies: ["ALPHA_TRIM_CONTAIN"] as const, supportsManualCrop: false, supportsAgentPlacement: false, imageSlotIds: [OBJECT_RIGHT_IMAGE_SLOT_ID] as const, allowedInputMimeTypes: ["image/png"] as const, alphaChannelRequired: true }),
  KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT: Object.freeze({ schemaVersion: INTEGRATION_SCHEMA_VERSION, channelNamespace: "KAKAO_MOMENT", placement: "BIZBOARD_THUMBNAIL_BOX_RIGHT", compositionMode: "RENDERER_COMPOSED", layoutMode: "TEMPLATE_LOCKED", artifactCardinality: "SINGLE", implementationStatus: "IMPLEMENTED", defaultPolicy: "SEMANTIC_CROP_COVER", semanticPlacement: "REQUIRED", allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const, supportsManualCrop: true, supportsAgentPlacement: true, imageSlotIds: [THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID] as const, allowedInputMimeTypes: ["image/png", "image/jpeg"] as const, alphaChannelRequired: false }),
  KAKAO_BIZBOARD_THUMBNAIL_MULTI_RIGHT: Object.freeze({ schemaVersion: INTEGRATION_SCHEMA_VERSION, channelNamespace: "KAKAO_MOMENT", placement: "BIZBOARD_THUMBNAIL_MULTI_RIGHT", compositionMode: "RENDERER_COMPOSED", layoutMode: "TEMPLATE_LOCKED", artifactCardinality: "SINGLE", implementationStatus: "IMPLEMENTED", defaultPolicy: "SEMANTIC_CROP_COVER", semanticPlacement: "REQUIRED", allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const, supportsManualCrop: true, supportsAgentPlacement: true, imageSlotIds: THUMBNAIL_MULTI_RIGHT_IMAGE_SLOT_IDS, allowedInputMimeTypes: ["image/png", "image/jpeg"] as const, alphaChannelRequired: false, minimumAssets: 1, maximumAssets: 2, requiredPlacementPlans: 2 }),
  KAKAO_BIZBOARD_MASK_SEMICIRCLE_RIGHT: Object.freeze({
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    channelNamespace: "KAKAO_MOMENT",
    placement: "BIZBOARD_MASK_SEMICIRCLE_RIGHT",
    compositionMode: "RENDERER_COMPOSED",
    layoutMode: "TEMPLATE_LOCKED",
    artifactCardinality: "SINGLE",
    implementationStatus: "IMPLEMENTED",
    defaultPolicy: "SEMANTIC_CROP_COVER",
    semanticPlacement: "REQUIRED",
    allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const,
    supportsManualCrop: true,
    supportsAgentPlacement: true,
    imageSlotIds: MASK_SEMICIRCLE_RIGHT_SLOT_IDS,
    allowedInputMimeTypes: ["image/png", "image/jpeg"] as const,
    alphaChannelRequired: false,
    minimumAssets: 1,
    maximumAssets: 2,
    requiredPlacementPlans: 1,
    slotCapabilities: [
      { slotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, slotRole: "IMAGE" as const, required: true, allowedInputMimeTypes: ["image/png", "image/jpeg"] as const, allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const, alphaChannelRequired: false, supportsManualCrop: true, supportsAgentPlacement: true },
      { slotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO" as const, required: false, allowedInputMimeTypes: ["image/png"] as const, allowedPolicies: ["ALPHA_TRIM_CONTAIN"] as const, alphaChannelRequired: true, colorRestriction: "NONE" as const, supportsManualCrop: false, supportsAgentPlacement: false },
    ],
  }),
  KAKAO_NATIVE_1200: Object.freeze({ schemaVersion: INTEGRATION_SCHEMA_VERSION, channelNamespace: "KAKAO_MOMENT", placement: "NATIVE_1200", compositionMode: "RENDERER_COMPOSED", layoutMode: "FREEFORM", artifactCardinality: "SINGLE", implementationStatus: "NOT_IMPLEMENTED", defaultPolicy: "SEMANTIC_CROP_COVER", semanticPlacement: "REQUIRED", allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const, supportsManualCrop: false, supportsAgentPlacement: false, allowedInputMimeTypes: [] as const, alphaChannelRequired: false }),
  NAVER_GFA_IMAGE_BANNER: Object.freeze({ schemaVersion: INTEGRATION_SCHEMA_VERSION, implementationStatus: "NOT_IMPLEMENTED", defaultPolicy: "SEMANTIC_CROP_COVER", semanticPlacement: "REQUIRED", allowedPolicies: ["SEMANTIC_CROP_COVER", "MANUAL_CROP"] as const, supportsManualCrop: false, supportsAgentPlacement: false, allowedInputMimeTypes: [] as const, alphaChannelRequired: false }),
});

export function getCapability(formatProfileId: string): ImagePlacementCapability | null {
  return CAPABILITIES[formatProfileId] ?? null;
}

export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function computeFingerprints(input: RendererIntegrationInputV1, assetDigests: Readonly<Record<string, string>>, resolvedPlans: readonly ImagePlacementPlan[]): Promise<{ requestFingerprint: string; pixelFingerprint: string }> {
  const requestFingerprint = await sha256Hex(canonicalJson(input));
  const slotOrder = getCapability(input.formatProfileId)?.imageSlotIds ?? [];
  const order = new Map(slotOrder.map((slot, index) => [slot, index]));
  const pixelPlans = [...resolvedPlans].sort((a, b) => {
    const aIndex = order.get(a.imageSlotId) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = order.get(b.imageSlotId) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.imageSlotId.localeCompare(b.imageSlotId);
  });
  const pixelInput = {
    formatProfileId: input.formatProfileId,
    templateId: input.templateId,
    copy: input.copy,
    assets: input.assets.map((asset) => ({ assetId: asset.assetId, mimeType: asset.mimeType, digest: assetDigests[asset.assetId] ?? "" })),
    imagePlacementPlans: pixelPlans.map((plan) => ({ imageSlotId: plan.imageSlotId, assetId: plan.assetId, policy: plan.policy, fitMode: plan.fitMode, cropRect: plan.cropRect, anchor: plan.anchor, subjectProtection: plan.subjectProtection })),
    output: input.output,
    templateContractVersion: "1.9.0",
  };
  const pixelFingerprint = await sha256Hex(canonicalJson(pixelInput));
  return { requestFingerprint, pixelFingerprint };
}

export type LegacyObjectRightInput = Readonly<{
  channel: "KAKAO_MOMENT";
  placement: "BIZBOARD";
  template: "OBJECT_RIGHT";
  advertiser: string;
  copy: { headline: string; subcopy: string };
  cta: { mode: "NONE"; label: "" };
  product: { relativePath: string; expectedSha256: string };
  output: { directory: string; baseName: string; overwrite: false };
  canvas: { width: 1029; height: 258 };
}>;

export type LegacyRenderResult = Readonly<{
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/png";
  appliedImagePlacement?: AppliedImagePlacement;
  appliedImagePlacements?: readonly AppliedImagePlacement[];
  validation?: readonly RendererValidationIssue[];
}>;

export type ThumbnailRenderRequest = Readonly<{
  input: RendererIntegrationInputV1;
  asset: RendererAssetDescriptor;
  resolvedAsset: AssetResolverResult;
  resolvedPlan: ImagePlacementPlan;
  resolvedSourceCropRect: NormalizedRect;
}>;

export type MaskSemicircleRenderSlot = Readonly<{
  imageSlotId: typeof MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID | typeof MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID;
  asset: RendererAssetDescriptor;
  resolvedAsset: AssetResolverResult;
  resolvedPlan: ImagePlacementPlan;
  resolvedSourceCropRect?: NormalizedRect;
}>;

export type MaskAsset = Readonly<{
  assetId: typeof MASK_SEMICIRCLE_RIGHT_MASK_ASSET_ID;
  bytes: Uint8Array;
  sha256: string;
}>;

export type MaskSemicircleRenderRequest = Readonly<{
  input: Pick<RendererIntegrationInputV1, "copy">;
  image: MaskSemicircleRenderSlot;
  logo?: MaskSemicircleRenderSlot;
  mask: MaskAsset;
}>;

export type IntegrationAdapterDependencies = Readonly<{
  resolver: RendererAssetResolver;
  renderLegacy?: (input: LegacyObjectRightInput, resolvedAsset: AssetResolverResult) => Promise<LegacyRenderResult>;
  renderThumbnail?: (request: ThumbnailRenderRequest) => Promise<LegacyRenderResult>;
  renderThumbnailMulti?: (request: ThumbnailMultiRenderRequest) => Promise<LegacyRenderResult>;
  renderMaskSemicircle?: (request: MaskSemicircleRenderRequest) => Promise<LegacyRenderResult>;
  maskAsset?: MaskAsset;
  assetDigests?: Readonly<Record<string, string>>;
}>;

export type ThumbnailMultiRenderSlot = Readonly<{
  imageSlotId: string;
  asset: RendererAssetDescriptor;
  resolvedAsset: AssetResolverResult;
  resolvedPlan: ImagePlacementPlan;
  resolvedSourceCropRect: NormalizedRect;
}>;

export type ThumbnailMultiRenderRequest = Readonly<{
  input: Pick<RendererIntegrationInputV1, "copy">;
  slots: readonly ThumbnailMultiRenderSlot[];
}>;

type ResolvedImageInspection = Readonly<{
  detectedMimeType: SupportedInputMimeType;
  width: number;
  height: number;
  hasAlpha: boolean;
  exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}>;

function detectResolvedMime(bytes: Uint8Array): SupportedInputMimeType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (png) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return null;
}

function isJpegSofMarker(marker: number): boolean {
  return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
}

function inspectResolvedImage(bytes: Uint8Array, resolverMetadata: AssetResolverResult["metadata"]): ResolvedImageInspection | null {
  const detectedMimeType = detectResolvedMime(bytes);
  if (!detectedMimeType) return null;
  if (detectedMimeType === "image/png") {
    if (bytes.byteLength < 26) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width < 1 || height < 1) return null;
    const colorType = view.getUint8(25);
    return { detectedMimeType, width, height, hasAlpha: colorType === 4 || colorType === 6, exifOrientation: 1 };
  }
  if (bytes.byteLength < 4 || !Array.from(bytes).some((value, index) => value === 0xff && bytes[index + 1] === 0xd9)) return null;
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return null;
    if (isJpegSofMarker(marker)) {
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      if (!width || !height) return null;
      const orientation = resolverMetadata?.exifOrientation ?? 1;
      const swapsDimensions = orientation >= 5 && orientation <= 8;
      return {
        detectedMimeType,
        width: swapsDimensions ? height : width,
        height: swapsDimensions ? width : height,
        hasAlpha: false,
        exifOrientation: orientation,
      };
    }
    offset += segmentLength;
  }
  return null;
}

function resolvedImageHasInvalidDimensions(bytes: Uint8Array): boolean {
  const detectedMimeType = detectResolvedMime(bytes);
  if (detectedMimeType === "image/png") {
    if (bytes.byteLength < 26) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452 && (view.getUint32(16) === 0 || view.getUint32(20) === 0);
  }
  return false;
}

function isRgbaPng32(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 26 || !signature.every((value, index) => bytes[index] === value)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452 && view.getUint32(16) === 1029 && view.getUint32(20) === 258 && view.getUint8(24) === 8 && view.getUint8(25) === 6;
}

export async function renderWithIntegrationAdapter(
  input: RendererIntegrationInputV1,
  dependencies: IntegrationAdapterDependencies,
): Promise<RendererIntegrationOutputV1> {
  const capability = getCapability(input.formatProfileId);
  const context: ContractValidationContext = capability
    ? {
        allowedPolicies: capability.allowedPolicies,
        allowedInputMimeTypes: capability.allowedInputMimeTypes,
        alphaChannelRequired: capability.alphaChannelRequired,
        ...(capability.imageSlotIds
          ? {
              requiredImageSlotIds: capability.slotCapabilities
                ? capability.slotCapabilities.filter((entry) => entry.required).map((entry) => entry.slotId)
                : capability.imageSlotIds,
              allowedImageSlotIds: capability.imageSlotIds,
            }
          : {}),
        ...(capability.slotCapabilities ? { slotCapabilities: capability.slotCapabilities } : {}),
      }
    : {};
  const initialIssues = capability && capability.implementationStatus === "IMPLEMENTED"
    ? validateIntegrationInput(input, context)
    : [issue("KBR-TEMPLATE-CONSTRAINT-VIOLATION", "ERROR", "template.capability_not_implemented", { path: "/formatProfileId", actual: input.formatProfileId })];
  if (input.formatProfileId === OBJECT_RIGHT_FORMAT_PROFILE_ID && input.templateId !== OBJECT_RIGHT_TEMPLATE_ID) initialIssues.push(issue("KBR-TEMPLATE-CONSTRAINT-VIOLATION", "ERROR", "template.template_id_mismatch", { path: "/templateId", actual: input.templateId, expected: OBJECT_RIGHT_TEMPLATE_ID }));
  if (input.formatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID && input.templateId !== THUMBNAIL_BOX_RIGHT_TEMPLATE_ID) initialIssues.push(issue("KBR-TEMPLATE-CONSTRAINT-VIOLATION", "ERROR", "template.template_id_mismatch", { path: "/templateId", actual: input.templateId, expected: THUMBNAIL_BOX_RIGHT_TEMPLATE_ID }));
  if (input.formatProfileId === THUMBNAIL_MULTI_RIGHT_FORMAT_PROFILE_ID && input.templateId !== THUMBNAIL_MULTI_RIGHT_TEMPLATE_ID) initialIssues.push(issue("KBR-TEMPLATE-CONSTRAINT-VIOLATION", "ERROR", "template.template_id_mismatch", { path: "/templateId", actual: input.templateId, expected: THUMBNAIL_MULTI_RIGHT_TEMPLATE_ID }));
  if (input.formatProfileId === MASK_SEMICIRCLE_RIGHT_FORMAT_PROFILE_ID && input.templateId !== MASK_SEMICIRCLE_RIGHT_TEMPLATE_ID) initialIssues.push(issue("KBR-TEMPLATE-CONSTRAINT-VIOLATION", "ERROR", "template.template_id_mismatch", { path: "/templateId", actual: input.templateId, expected: MASK_SEMICIRCLE_RIGHT_TEMPLATE_ID }));
  const assetDigests: Record<string, string> = { ...(dependencies.assetDigests ?? {}) };
  const resolvedPlans = input.imagePlacementPlans.map((plan) => {
    const candidate = input.cropCandidates?.find((item) => item.candidateId === plan.cropCandidateId);
    return candidate && !plan.cropRect ? { ...plan, cropRect: candidate.cropRect } : plan;
  });
  const issues = [...initialIssues];
  if (input.formatProfileId === MASK_SEMICIRCLE_RIGHT_FORMAT_PROFILE_ID) {
    const logoSlot = capability?.slotCapabilities?.find((entry) => entry.slotRole === "LOGO");
    const logoPlan = resolvedPlans.find((plan) => plan.imageSlotId === MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID);
    if (logoSlot && !logoSlot.required && !logoPlan && input.assets.length > 1) {
      issues.push(issue("KBR-LOGO-PLAN-MISSING", "ERROR", "placement.logo_plan_missing", { path: "/imagePlacementPlans", imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", expected: "LOGO_PRIMARY plan when a second MASK asset is supplied" }));
    }
  }
  let renderResult: LegacyRenderResult | undefined;
  if (issues.every((entry) => entry.severity !== "ERROR")) {
    const assetById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
    const slotOrder = capability?.imageSlotIds ?? input.imagePlacementPlans.map((plan) => plan.imageSlotId);
    const referencedAssetIds = [...new Set(slotOrder.map((slot) => resolvedPlans.find((plan) => plan.imageSlotId === slot)?.assetId).filter((assetId): assetId is string => Boolean(assetId)))];
    if (capability?.minimumAssets !== undefined && referencedAssetIds.length < capability.minimumAssets) {
      issues.push(issue("KBR-IMAGE-SLOT-ASSET-COUNT", "ERROR", "placement.asset_count_invalid", { path: "/assets", actual: referencedAssetIds.length, expected: { minimum: capability.minimumAssets, maximum: capability.maximumAssets } }));
    }
    if (capability?.maximumAssets !== undefined && referencedAssetIds.length > capability.maximumAssets) {
      issues.push(issue("KBR-IMAGE-SLOT-ASSET-COUNT", "ERROR", "placement.asset_count_invalid", { path: "/assets", actual: referencedAssetIds.length, expected: { minimum: capability.minimumAssets, maximum: capability.maximumAssets } }));
    }
    const resolvedAssets = new Map<string, { asset: RendererAssetDescriptor; resolved: AssetResolverResult; digest: string }>();
    for (const assetId of referencedAssetIds) {
      const asset = assetById.get(assetId);
      if (!asset) continue;
      try {
        const resolved = await dependencies.resolver.resolve(asset.assetRef);
        const digest = await sha256Hex(resolved.bytes);
        assetDigests[asset.assetId] = digest;
        if (asset.checksumSha256 && asset.checksumSha256.toLowerCase() !== digest) issues.push(issue("KBR-ASSET-CHECKSUM-MISMATCH", "ERROR", "asset.checksum_mismatch", { path: "/assets", assetId: asset.assetId, actual: digest, expected: asset.checksumSha256 }));
        const inspected = inspectResolvedImage(resolved.bytes, resolved.metadata);
        if (!inspected) {
          const detectedMimeType = detectResolvedMime(resolved.bytes);
          const dimensionInvalid = resolvedImageHasInvalidDimensions(resolved.bytes);
          issues.push(issue(!detectedMimeType ? "KBR-ASSET-MIME-NOT-ALLOWED" : dimensionInvalid ? "KBR-IMAGE-DIMENSION-INVALID" : "KBR-IMAGE-DECODE-FAILED", "ERROR", !detectedMimeType ? "asset.mime_not_allowed" : dimensionInvalid ? "asset.image_dimension_invalid" : "asset.image_decode_failed", { path: "/assets", assetId: asset.assetId }));
        } else {
          const actual = inspected;
          if (context.allowedInputMimeTypes && !context.allowedInputMimeTypes.includes(actual.detectedMimeType)) issues.push(issue("KBR-ASSET-MIME-NOT-ALLOWED", "ERROR", "asset.mime_not_allowed", { path: "/assets", assetId: asset.assetId, actual: actual.detectedMimeType, expected: context.allowedInputMimeTypes }));
          if (resolved.metadata && (!Number.isInteger(resolved.metadata.exifOrientation) || resolved.metadata.exifOrientation < 1 || resolved.metadata.exifOrientation > 8)) issues.push(issue("KBR-EXIF-ORIENTATION-INVALID", "ERROR", "asset.exif_orientation_invalid", { path: "/assets", assetId: asset.assetId, actual: resolved.metadata.exifOrientation }));
          if (resolved.metadata && (resolved.metadata.width !== actual.width || resolved.metadata.height !== actual.height)) issues.push(issue("KBR-ASSET-DIMENSION-MISMATCH", "ERROR", "asset.dimension_mismatch", { path: "/assets", assetId: asset.assetId, actual: { width: actual.width, height: actual.height }, expected: { width: resolved.metadata.width, height: resolved.metadata.height } }));
          if (resolved.resolvedMimeType !== actual.detectedMimeType || asset.mimeType !== actual.detectedMimeType) issues.push(issue("KBR-ASSET-MIME-EXTENSION-MISMATCH", "ERROR", "asset.mime_extension_mismatch", { path: "/assets", assetId: asset.assetId, actual: actual.detectedMimeType, expected: asset.mimeType }));
          if (asset.declaredWidth !== undefined && asset.declaredWidth !== actual.width || asset.declaredHeight !== undefined && asset.declaredHeight !== actual.height) issues.push(issue("KBR-ASSET-DIMENSION-MISMATCH", "ERROR", "asset.dimension_mismatch", { path: "/assets", assetId: asset.assetId, actual: { width: actual.width, height: actual.height }, expected: { width: asset.declaredWidth, height: asset.declaredHeight } }));
          if (context.alphaChannelRequired && !actual.hasAlpha) issues.push(issue("KBR-ALPHA-CHANNEL-REQUIRED", "ERROR", "asset.alpha_channel_required", { path: "/assets", assetId: asset.assetId }));
          for (const slotCapability of (context.slotCapabilities ?? []).filter((entry) => resolvedPlans.some((plan) => plan.assetId === asset.assetId && plan.imageSlotId === entry.slotId))) {
            if (slotCapability.alphaChannelRequired && !actual.hasAlpha) issues.push(issue(slotCapability.slotRole === "LOGO" ? "KBR-LOGO-ALPHA-REQUIRED" : "KBR-ALPHA-CHANNEL-REQUIRED", "ERROR", slotCapability.slotRole === "LOGO" ? "asset.logo_alpha_required" : "asset.alpha_channel_required", { path: `/imagePlacementPlans/${slotCapability.slotId}/assetId`, imageSlotId: slotCapability.slotId, slotRole: slotCapability.slotRole, assetId: asset.assetId }));
          }
          resolvedAssets.set(asset.assetId, { asset, resolved, digest });
        }
      } catch (error) {
        issues.push(issue("KBR-ASSET-REF-UNRESOLVED", "ERROR", "asset.ref_unresolved", { path: "/assets", assetId: asset.assetId, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    const copy = input.copy;
    if (!copy.advertiser || !copy.headline || !copy.subcopy) issues.push(issue("KBR-INPUT-007", "ERROR", "input.required_string_missing", { path: "/copy" }));
    if (issues.every((entry) => entry.severity !== "ERROR")) {
      const orderedPlans = slotOrder.map((slot) => resolvedPlans.find((plan) => plan.imageSlotId === slot)).filter((plan): plan is ImagePlacementPlan => Boolean(plan));
      if (input.formatProfileId === THUMBNAIL_MULTI_RIGHT_FORMAT_PROFILE_ID) {
        if (!dependencies.renderThumbnailMulti) issues.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.thumbnail_renderer_missing", { path: "/artifact" }));
        else if (orderedPlans.some((plan) => !plan.cropRect)) issues.push(issue("KBR-CROP-RECT-REQUIRED", "ERROR", "placement.semantic_crop_required", { path: "/imagePlacementPlans" }));
        else {
          try {
            const slots: ThumbnailMultiRenderSlot[] = [];
            for (const plan of orderedPlans) {
              const resolvedAsset = resolvedAssets.get(plan.assetId);
              if (!resolvedAsset || !plan.cropRect) continue;
              slots.push({ imageSlotId: plan.imageSlotId, asset: resolvedAsset.asset, resolvedAsset: resolvedAsset.resolved, resolvedPlan: plan, resolvedSourceCropRect: plan.cropRect });
            }
            if (slots.length === orderedPlans.length) renderResult = await dependencies.renderThumbnailMulti({ input: { copy: input.copy }, slots });
          } catch (error) {
            issues.push(issue("KBR-IMAGE-DECODE-FAILED", "ERROR", "asset.image_decode_failed", { path: "/assets", message: error instanceof Error ? error.message : String(error) }));
          }
        }
      } else if (input.formatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID) {
        const plan = orderedPlans[0];
        const resolvedAsset = plan ? resolvedAssets.get(plan.assetId) : undefined;
        if (!dependencies.renderThumbnail) issues.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.thumbnail_renderer_missing", { path: "/artifact" }));
        else if (!plan?.cropRect) issues.push(issue("KBR-CROP-RECT-REQUIRED", "ERROR", "placement.semantic_crop_required", { path: "/imagePlacementPlans/0/cropRect" }));
        else if (!resolvedAsset) issues.push(issue("KBR-ASSET-NOT-FOUND", "ERROR", "asset.not_found", { path: "/assets", assetId: plan.assetId }));
        else {
          try {
            renderResult = await dependencies.renderThumbnail({ input, asset: resolvedAsset.asset, resolvedAsset: resolvedAsset.resolved, resolvedPlan: plan, resolvedSourceCropRect: plan.cropRect });
          } catch (error) {
            issues.push(issue("KBR-IMAGE-DECODE-FAILED", "ERROR", "asset.image_decode_failed", { path: "/assets", assetId: resolvedAsset.asset.assetId, message: error instanceof Error ? error.message : String(error) }));
          }
        }
      } else if (input.formatProfileId === MASK_SEMICIRCLE_RIGHT_FORMAT_PROFILE_ID) {
        const imagePlan = orderedPlans.find((plan) => plan.imageSlotId === MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID);
        const logoPlan = orderedPlans.find((plan) => plan.imageSlotId === MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID);
        const imageAsset = imagePlan ? resolvedAssets.get(imagePlan.assetId) : undefined;
        const logoAsset = logoPlan ? resolvedAssets.get(logoPlan.assetId) : undefined;
        if (imagePlan && logoPlan && imagePlan.assetId === logoPlan.assetId) issues.push(issue("KBR-LOGO-ASSET-DUPLICATE", "ERROR", "asset.logo_asset_duplicate", { path: "/imagePlacementPlans/LOGO_PRIMARY/assetId", imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: logoPlan.assetId }));
        if (!dependencies.renderMaskSemicircle) issues.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.mask_renderer_missing", { path: "/artifact" }));
        else if (!dependencies.maskAsset) issues.push(issue("KBR-MASK-ASSET-MISSING", "ERROR", "mask.asset_missing", { path: "/maskAsset", actual: MASK_SEMICIRCLE_RIGHT_MASK_ASSET_ID, expected: MASK_SEMICIRCLE_RIGHT_MASK_ASSET_PATH }));
        else if (dependencies.maskAsset.assetId !== MASK_SEMICIRCLE_RIGHT_MASK_ASSET_ID || dependencies.maskAsset.sha256.toLowerCase() !== MASK_SEMICIRCLE_RIGHT_MASK_ASSET_SHA256 || (await sha256Hex(dependencies.maskAsset.bytes)).toLowerCase() !== MASK_SEMICIRCLE_RIGHT_MASK_ASSET_SHA256) issues.push(issue("KBR-MASK-ASSET-DIGEST-MISMATCH", "ERROR", "mask.asset_digest_mismatch", { path: "/maskAsset", actual: { assetId: dependencies.maskAsset.assetId, declared: dependencies.maskAsset.sha256, actual: await sha256Hex(dependencies.maskAsset.bytes) }, expected: { assetId: MASK_SEMICIRCLE_RIGHT_MASK_ASSET_ID, sha256: MASK_SEMICIRCLE_RIGHT_MASK_ASSET_SHA256 } }));
        else if (!imagePlan?.cropRect) issues.push(issue("KBR-CROP-RECT-REQUIRED", "ERROR", "placement.image_crop_required", { path: "/imagePlacementPlans/IMAGE_PRIMARY/cropRect", imageSlotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, slotRole: "IMAGE" }));
        else if (!imageAsset) issues.push(issue("KBR-ASSET-NOT-FOUND", "ERROR", "asset.image_missing", { path: "/imagePlacementPlans/IMAGE_PRIMARY/assetId", imageSlotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, slotRole: "IMAGE" }));
        else {
          try {
            renderResult = await dependencies.renderMaskSemicircle({
              input: { copy: input.copy },
              image: { imageSlotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, asset: imageAsset.asset, resolvedAsset: imageAsset.resolved, resolvedPlan: imagePlan, resolvedSourceCropRect: imagePlan.cropRect },
              ...(logoPlan && logoAsset
                ? { logo: { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, asset: logoAsset.asset, resolvedAsset: logoAsset.resolved, resolvedPlan: logoPlan } }
                : {}),
              mask: dependencies.maskAsset,
            });
          } catch (error) {
            issues.push(issue("KBR-IMAGE-DECODE-FAILED", "ERROR", "asset.image_decode_failed", { path: "/assets", message: error instanceof Error ? error.message : String(error) }));
          }
        }
      } else {
        const plan = orderedPlans[0];
        const resolvedAsset = plan ? resolvedAssets.get(plan.assetId) : undefined;
        if (!resolvedAsset) issues.push(issue("KBR-ASSET-NOT-FOUND", "ERROR", "asset.not_found", { path: "/assets", ...(plan?.assetId ? { assetId: plan.assetId } : {}) }));
        else if (dependencies.renderLegacy) {
          renderResult = await dependencies.renderLegacy({ channel: "KAKAO_MOMENT", placement: "BIZBOARD", template: "OBJECT_RIGHT", advertiser: copy.advertiser!, copy: { headline: copy.headline!, subcopy: copy.subcopy! }, cta: { mode: "NONE", label: "" }, product: { relativePath: `integration/${resolvedAsset.asset.assetId}${resolvedAsset.asset.mimeType === "image/jpeg" ? ".jpg" : ".png"}`, expectedSha256: resolvedAsset.digest }, output: { directory: "integration-output", baseName: "output", overwrite: false }, canvas: { width: 1029, height: 258 } }, resolvedAsset.resolved);
        } else issues.push(issue("KBR-OUTPUT-INVALID", "ERROR", "output.renderer_missing", { path: "/artifact" }));
      }
    }
  }
  if (renderResult?.validation) issues.push(...renderResult.validation);
  const fingerprints = await computeFingerprints(input, assetDigests, resolvedPlans);
  const sorted = sortIssues(issues);
  const errors = sorted.filter((entry) => entry.severity === "ERROR");
  const warnings = sorted.filter((entry) => entry.severity === "WARNING");
  const info = sorted.filter((entry) => entry.severity === "INFO");
  if (!renderResult || errors.length > 0) return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors, warnings, info }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  if (renderResult.mimeType !== "image/png" || renderResult.width !== 1029 || renderResult.height !== 258 || !isRgbaPng32(renderResult.bytes)) {
    const outputError = issue("KBR-OUTPUT-INVALID", "ERROR", "output.artifact_contract_invalid", { path: "/artifact", actual: { mimeType: renderResult.mimeType, width: renderResult.width, height: renderResult.height }, expected: { mimeType: "image/png", width: 1029, height: 258 } });
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: [outputError], warnings, info }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  const placements = [...(renderResult.appliedImagePlacements ?? (renderResult.appliedImagePlacement ? [renderResult.appliedImagePlacement] : []))];
  const validatedSorted = sortIssues(issues);
  const validatedErrors = validatedSorted.filter((entry) => entry.severity === "ERROR");
  const validatedWarnings = validatedSorted.filter((entry) => entry.severity === "WARNING");
  const validatedInfo = validatedSorted.filter((entry) => entry.severity === "INFO");
  if (validatedErrors.length > 0) {
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: validatedErrors, warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  const expectedSlots = capability?.slotCapabilities
    ? capability.slotCapabilities
      .filter((slot) => slot.required || resolvedPlans.some((plan) => plan.imageSlotId === slot.slotId))
      .map((slot) => slot.slotId)
    : capability?.imageSlotIds ?? [];
  if (placements.length !== expectedSlots.length) {
    const placementError = issue("KBR-OUTPUT-INVALID", "ERROR", "output.applied_placement_missing", { path: "/appliedImagePlacements", expected: expectedSlots.length, actual: placements.length });
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: [placementError], warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  const placementOrder = new Map(expectedSlots.map((slot, index) => [slot, index]));
  placements.sort((a, b) => (placementOrder.get(a.imageSlotId) ?? Number.MAX_SAFE_INTEGER) - (placementOrder.get(b.imageSlotId) ?? Number.MAX_SAFE_INTEGER));
  if (placements.some((placement) => !placementOrder.has(placement.imageSlotId))) {
    const placementError = issue("KBR-OUTPUT-INVALID", "ERROR", "output.applied_placement_slot_invalid", { path: "/appliedImagePlacements" });
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: [placementError], warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  const requestedBySlot = new Map(input.imagePlacementPlans.map((plan) => [plan.imageSlotId, plan]));
  if (placements.some((placement) => {
    const requestedPlan = requestedBySlot.get(placement.imageSlotId);
    return placement.changedFromRequestedPlan !== false || !requestedPlan || placement.assetId !== requestedPlan.assetId || placement.policy !== requestedPlan.policy;
  })) {
    const placementError = issue("KBR-OUTPUT-INVALID", "ERROR", "output.applied_placement_changed", { path: "/appliedImagePlacements", expected: { changedFromRequestedPlan: false }, actual: placements });
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: [placementError], warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  if (new Set(placements.map((placement) => placement.imageSlotId)).size !== placements.length) {
    const placementError = issue("KBR-OUTPUT-INVALID", "ERROR", "output.applied_placement_duplicate", { path: "/appliedImagePlacements" });
    return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "BLOCKED", appliedImagePlacements: [], validation: { errors: [placementError], warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
  }
  const artifactChecksum = await sha256Hex(renderResult.bytes);
  return { schemaVersion: INTEGRATION_SCHEMA_VERSION, status: "PASS", artifact: { mimeType: "image/png", width: renderResult.width, height: renderResult.height, bytes: renderResult.bytes.byteLength, checksumSha256: artifactChecksum }, appliedImagePlacements: placements, validation: { errors: [], warnings: validatedWarnings, info: validatedInfo }, ...fingerprints, renderFingerprint: fingerprints.pixelFingerprint };
}
