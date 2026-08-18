import canonicalize from "canonicalize";

import type {
  ArtifactCardinality,
  ChannelId,
  CompositionMode,
  ImageAnchor,
  ImageFitMode,
  ImagePlacementPolicy,
  ImplementationStatus,
  NormalizedPoint,
  NormalizedRect,
  PlacementPlanSource,
  ProtectedSubject,
  RendererValidationIssue,
  SubjectProtection,
} from "./index.js";

export const FREEFORM_PLAN_SCHEMA_VERSION = "1.0.0" as const;
export const FREEFORM_DEFAULT_OPACITY = 1 as const;
export const FREEFORM_DEFAULT_LETTER_SPACING_PX = 0 as const;
export const FREEFORM_FONT_FALLBACK_ALLOWED = false as const;

export type LayoutMode = "TEMPLATE_LOCKED" | "FREEFORM";
export type CreativePlanSource = "MANUAL" | "AGENT" | "SAVED_CREATIVE";
export type CreativeSemanticRole =
  | "HEADLINE"
  | "SUBCOPY"
  | "ADVERTISER"
  | "DISCLAIMER"
  | "CTA"
  | "LOGO"
  | "PRIMARY_IMAGE"
  | "DECORATION"
  | "OTHER";
export type SafeZoneImportance = "KEY_CREATIVE" | "DECORATIVE" | "IGNORE";
export type TextWrapMode = "NO_WRAP" | "EXPLICIT_NEWLINES" | "WORD_WRAP";
export type TextOverflowMode = "ERROR" | "CLIP";
/**
 * Public output aliases. `JPG` is retained for compatibility with the F1
 * test-profile request shape; new catalog profiles use the canonical
 * `JPEG` spelling.
 */
export type OutputFormat = "PNG" | "JPG" | "JPEG";
export type FormatCatalogStatus = "READY" | "CATALOG_NOT_READY" | "INTERNAL_TEST_ONLY";

export type CanvasBackground =
  | Readonly<{ type: "TRANSPARENT" }>
  | Readonly<{ type: "SOLID"; color: string }>;

export type ImagePlacementSpec = Readonly<{
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

export type CreativeElementBase = Readonly<{
  id: string;
  bounds: NormalizedRect;
  zIndex: number;
  opacity?: number;
  role?: CreativeSemanticRole;
  safeZoneImportance?: SafeZoneImportance;
}>;

export type FreeformImageElement = CreativeElementBase & Readonly<{
  type: "IMAGE";
  assetId: string;
  placement: ImagePlacementSpec;
}>;

export type FreeformLogoElement = CreativeElementBase & Readonly<{
  type: "LOGO";
  assetId: string;
  placement: ImagePlacementSpec;
}>;

export type FreeformTextElement = CreativeElementBase & Readonly<{
  type: "TEXT";
  text: string;
  fontId: string;
  fontSizePx: number;
  color: string;
  lineHeightPx: number;
  textAlign: "LEFT" | "CENTER" | "RIGHT";
  verticalAlign: "TOP" | "CENTER" | "BOTTOM";
  wrapMode: TextWrapMode;
  overflowMode: TextOverflowMode;
  letterSpacingPx?: number;
}>;

export type FreeformShapeElement = CreativeElementBase & Readonly<{
  type: "SHAPE";
  shape: "RECTANGLE" | "ELLIPSE";
  fillColor: string;
}>;

export type CreativeElement =
  | FreeformImageElement
  | FreeformTextElement
  | FreeformLogoElement
  | FreeformShapeElement;

export type CreativeLayoutPlan = Readonly<{
  schemaVersion: typeof FREEFORM_PLAN_SCHEMA_VERSION;
  formatProfileId: string;
  source: CreativePlanSource;
  background: CanvasBackground;
  elements: readonly CreativeElement[];
}>;

export type FormatProfile = Readonly<{
  formatProfileId: string;
  /** Additive profile revision used in deterministic pixel fingerprint material. */
  profileVersion?: string;
  /** Registry-provided human label for Renderer Lab selectors. */
  displayName?: string;
  /** Legacy catalog-family label; do not reinterpret it as the top-level channel namespace. */
  channel?: string;
  /** Additive N1A channel namespace. Legacy profiles may omit it and hydrate as KAKAO_MOMENT. */
  channelNamespace?: ChannelId;
  /** Additive N1A composition axis; legacy profiles default to RENDERER_COMPOSED. */
  compositionMode?: CompositionMode;
  /** Additive N1A artifact axis; legacy profiles default to SINGLE. */
  artifactCardinality?: ArtifactCardinality;
  /** Optional channel-scoped placement key; no pixel geometry is implied by this field. */
  placement?: string;
  canvas: Readonly<{ width: number; height: number }>;
  canvasSpec?: Readonly<{ kind: "FIXED" | "VARIABLE_HEIGHT"; width: number; minimumHeight?: number; maximumHeight?: number }>;
  layoutMode: LayoutMode;
  allowedOutputFormats: readonly OutputFormat[];
  implementationStatus: ImplementationStatus;
  catalogStatus?: FormatCatalogStatus;
  /** Additive F3A channel-catalog metadata. */
  officialSizeRule?: "EXACT" | "MINIMUM_WITH_RATIO";
  officialRatio?: string;
  outputConstraints?: Readonly<{
    allowedFormats: readonly ("PNG" | "JPEG")[];
    minimumBytes?: number;
    maximumBytes?: number;
    minimumBytesComparator?: "GTE" | "GT";
    maximumBytesComparator?: "LTE" | "LT";
    requiresOpaqueOutput: boolean | "UNSPECIFIED";
  }>;
  /** Source-backed text bounds. Omitted fields are not machine-enforced. */
  textConstraints?: Readonly<{
    maxLines?: number;
    maxFontSizePx?: number;
    minRasterHeightPx?: number;
    maxDistinctColors?: number;
    enforcement?: "MACHINE" | "NON_MACHINE_ENFORCEABLE";
    sourceStatus?: "SOURCE_CONFIRMED" | "UNRESOLVED";
    minimumFontSizePtByRole?: Readonly<Record<string, number>>;
  }>;
  /** Additive source/compliance evidence; it never changes pixels. */
  complianceMetadata?: unknown;
  elementConstraints?: Readonly<{
    allowImage: boolean;
    allowText: boolean;
    allowLogo: boolean;
    allowShape?: boolean;
  }>;
  safeZonePolicy?: unknown;
  collectionRule?: unknown;
  classification?: string;
}>;

export type FontRegistryEntry = Readonly<{
  fontId: string;
  familyName: string;
  weight: number;
  style: "NORMAL" | "ITALIC";
  assetPath: string;
  sha256: string;
  licenseId: string;
  status: "RESOLVED_ASSET" | "UNRESOLVED_ASSET";
}>;

export type FreeformFontRegistry = Readonly<{
  registryVersion: string;
  fallbackAllowed: false;
  entries: readonly FontRegistryEntry[];
}>;

type FreeformIssueDetails = {
  path?: string | undefined;
  actual?: unknown;
  expected?: unknown;
  elementId?: string | undefined;
  assetId?: string | undefined;
};

function freeformIssue(
  code: string,
  messageKey: string,
  details: FreeformIssueDetails = {},
): RendererValidationIssue {
  return {
    code,
    severity: "ERROR",
    messageKey,
    ...(details.path !== undefined ? { path: details.path } : {}),
    ...(details.actual !== undefined ? { actual: details.actual } : {}),
    ...(details.expected !== undefined ? { expected: details.expected } : {}),
    ...(details.elementId !== undefined ? { elementId: details.elementId } : {}),
    ...(details.assetId !== undefined ? { assetId: details.assetId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNormalizedRect(value: unknown): value is NormalizedRect {
  if (!isRecord(value)) return false;
  const { x, y, width, height } = value;
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height)
    && x >= 0 && y >= 0 && width > 0 && height > 0 && x <= 1 && y <= 1 && width <= 1 && height <= 1
    && x + width <= 1 && y + height <= 1;
}

function isNormalizedPoint(value: unknown): value is NormalizedPoint {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.x) && isFiniteNumber(value.y)
    && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(value);
}

function hasUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).some((key) => !keys.has(key));
}

function validateBounds(value: unknown, path: string, elementId?: string): RendererValidationIssue[] {
  return isNormalizedRect(value)
    ? []
    : [freeformIssue("KBR-FREEFORM-BOUNDS-OUT-OF-RANGE", "freeform.bounds_out_of_range", { path, elementId, actual: value, expected: "normalized rectangle within 0..1" })];
}

function validatePlacement(value: unknown, path: string, elementId: string): RendererValidationIssue[] {
  if (!isRecord(value)) return [freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_invalid", { path, elementId })];
  const allowed = ["policy", "source", "fitMode", "cropRect", "focalPoint", "anchor", "subjectProtection", "cropCandidateId", "confidence", "protectedSubjects", "rationale"];
  if (hasUnknownKeys(value, allowed)) return [freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_unknown_property", { path, elementId })];
  const errors: RendererValidationIssue[] = [];
  const policies: ImagePlacementPolicy[] = ["ALPHA_TRIM_CONTAIN", "CENTER_CONTAIN", "SEMANTIC_CROP_COVER", "MANUAL_CROP"];
  const sources: PlacementPlanSource[] = ["DETERMINISTIC", "MANUAL", "AGENT", "SAVED_CREATIVE"];
  const anchors: ImageAnchor[] = ["CENTER", "CENTER_LEFT", "CENTER_RIGHT", "TOP_CENTER", "TOP_LEFT", "TOP_RIGHT", "BOTTOM_CENTER", "BOTTOM_LEFT", "BOTTOM_RIGHT"];
  const protections: SubjectProtection[] = ["REQUIRED", "PREFERRED", "NONE"];
  if (!policies.includes(value.policy as ImagePlacementPolicy) || !sources.includes(value.source as PlacementPlanSource) || !["CONTAIN", "COVER"].includes(value.fitMode as string) || !anchors.includes(value.anchor as ImageAnchor) || !protections.includes(value.subjectProtection as SubjectProtection)) {
    errors.push(freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_enum_invalid", { path, elementId }));
  }
  if (value.cropRect !== undefined && !isNormalizedRect(value.cropRect)) errors.push(freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_crop_invalid", { path: `${path}/cropRect`, elementId }));
  if (value.focalPoint !== undefined && !isNormalizedPoint(value.focalPoint)) errors.push(freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_focal_point_invalid", { path: `${path}/focalPoint`, elementId }));
  if (value.confidence !== undefined && (!isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1)) errors.push(freeformIssue("KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", "freeform.image_placement_confidence_invalid", { path: `${path}/confidence`, elementId }));
  return errors;
}

function validateElement(element: unknown, path: string, fontRegistry?: FreeformFontRegistry): RendererValidationIssue[] {
  if (!isRecord(element)) return [freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.element_invalid", { path })];
  const id = typeof element.id === "string" ? element.id : undefined;
  const common = ["id", "bounds", "zIndex", "opacity", "role", "safeZoneImportance", "type"];
  const errors: RendererValidationIssue[] = [];
  const typeSpecific = element.type === "IMAGE" || element.type === "LOGO"
    ? ["assetId", "placement"]
    : element.type === "TEXT"
      ? ["text", "fontId", "fontSizePx", "color", "lineHeightPx", "textAlign", "verticalAlign", "wrapMode", "overflowMode", "letterSpacingPx"]
      : element.type === "SHAPE"
        ? ["shape", "fillColor"]
        : [];
  if (hasUnknownKeys(element, [...common, ...typeSpecific])) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.element_unknown_property", { path, elementId: id }));
  if (!id || id.length === 0) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.element_id_invalid", { path: `${path}/id`, elementId: id }));
  errors.push(...validateBounds(element.bounds, `${path}/bounds`, id));
  if (!isFiniteNumber(element.zIndex) || !Number.isInteger(element.zIndex)) errors.push(freeformIssue("KBR-FREEFORM-ZINDEX-INVALID", "freeform.zindex_invalid", { path: `${path}/zIndex`, elementId: id }));
  if (element.opacity !== undefined && (!isFiniteNumber(element.opacity) || element.opacity < 0 || element.opacity > 1)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.opacity_invalid", { path: `${path}/opacity`, elementId: id }));
  if (element.role !== undefined && !["HEADLINE", "SUBCOPY", "ADVERTISER", "DISCLAIMER", "CTA", "LOGO", "PRIMARY_IMAGE", "DECORATION", "OTHER"].includes(element.role as string)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.role_invalid", { path: `${path}/role`, elementId: id }));
  if (element.safeZoneImportance !== undefined && !["KEY_CREATIVE", "DECORATIVE", "IGNORE"].includes(element.safeZoneImportance as string)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.safe_zone_importance_invalid", { path: `${path}/safeZoneImportance`, elementId: id }));
  if (element.type === "IMAGE" || element.type === "LOGO") {
    if (typeof element.assetId !== "string" || element.assetId.length === 0) errors.push(freeformIssue("KBR-FREEFORM-IMAGE-ASSET-NOT-FOUND", "freeform.image_asset_missing", { path: `${path}/assetId`, elementId: id }));
    errors.push(...validatePlacement(element.placement, `${path}/placement`, id ?? ""));
  } else if (element.type === "TEXT") {
    if (typeof element.text !== "string" || typeof element.fontId !== "string" || element.fontId.length === 0) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.text_required_field_missing", { path, elementId: id }));
    if (!isFiniteNumber(element.fontSizePx) || element.fontSizePx <= 0 || !isFiniteNumber(element.lineHeightPx) || element.lineHeightPx <= 0) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.text_metrics_invalid", { path, elementId: id }));
    if (!isHexColor(element.color)) errors.push(freeformIssue("KBR-FREEFORM-TEXT-COLOR-INVALID", "freeform.text_color_invalid", { path: `${path}/color`, elementId: id, actual: element.color, expected: "#RRGGBB or #RRGGBBAA" }));
    if (!(["LEFT", "CENTER", "RIGHT"].includes(element.textAlign as string) && ["TOP", "CENTER", "BOTTOM"].includes(element.verticalAlign as string))) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.text_alignment_invalid", { path, elementId: id }));
    if (element.wrapMode === "WORD_WRAP") errors.push(freeformIssue("KBR-FREEFORM-TEXT-WRAP-NOT-SUPPORTED", "freeform.text_word_wrap_not_supported", { path: `${path}/wrapMode`, elementId: id }));
    if (!["NO_WRAP", "EXPLICIT_NEWLINES", "WORD_WRAP"].includes(element.wrapMode as string)) errors.push(freeformIssue("KBR-FREEFORM-TEXT-WRAP-NOT-SUPPORTED", "freeform.text_wrap_invalid", { path: `${path}/wrapMode`, elementId: id }));
    if (!["ERROR", "CLIP"].includes(element.overflowMode as string)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.text_overflow_invalid", { path: `${path}/overflowMode`, elementId: id }));
    if (element.wrapMode === "NO_WRAP" && typeof element.text === "string" && /\r?\n/u.test(element.text)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.no_wrap_newline_forbidden", { path: `${path}/text`, elementId: id }));
    if (element.letterSpacingPx !== undefined && !isFiniteNumber(element.letterSpacingPx)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.letter_spacing_invalid", { path: `${path}/letterSpacingPx`, elementId: id }));
    if (fontRegistry && typeof element.fontId === "string") errors.push(...validateFontReference(element.fontId, fontRegistry, `${path}/fontId`));
  } else if (element.type === "SHAPE") {
    if (!["RECTANGLE", "ELLIPSE"].includes(element.shape as string) || !isHexColor(element.fillColor)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.shape_contract_invalid", { path, elementId: id }));
  } else {
    errors.push(freeformIssue("KBR-FREEFORM-ELEMENT-TYPE-NOT-SUPPORTED", "freeform.element_type_not_supported", { path: `${path}/type`, elementId: id, actual: element.type }));
  }
  return errors;
}

export type FreeformPlanValidationOptions = Readonly<{
  formatProfileId?: string;
  profile?: FormatProfile;
  fontRegistry?: FreeformFontRegistry;
  requireProfile?: boolean;
}>;

export function validateCreativeLayoutPlan(value: unknown, options: FreeformPlanValidationOptions = {}): RendererValidationIssue[] {
  if (!isRecord(value)) return [freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.plan_invalid", { path: "" })];
  const errors: RendererValidationIssue[] = [];
  const allowed = ["schemaVersion", "formatProfileId", "source", "background", "elements"];
  if (hasUnknownKeys(value, allowed)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.plan_unknown_property", { path: "" }));
  if (value.schemaVersion !== FREEFORM_PLAN_SCHEMA_VERSION) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.plan_schema_version_invalid", { path: "/schemaVersion", actual: value.schemaVersion, expected: FREEFORM_PLAN_SCHEMA_VERSION }));
  if (typeof value.formatProfileId !== "string" || value.formatProfileId.length === 0) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.format_profile_id_invalid", { path: "/formatProfileId" }));
  if (options.formatProfileId !== undefined && value.formatProfileId !== options.formatProfileId) errors.push(freeformIssue("KBR-FREEFORM-FORMAT-PROFILE-MISMATCH", "freeform.format_profile_mismatch", { path: "/formatProfileId", actual: value.formatProfileId, expected: options.formatProfileId }));
  if (options.requireProfile && !options.profile) errors.push(freeformIssue("KBR-FREEFORM-CANVAS-PROFILE-MISSING", "freeform.canvas_profile_missing", { path: "/formatProfileId", actual: value.formatProfileId }));
  if (options.profile && (options.profile.formatProfileId !== value.formatProfileId || options.profile.layoutMode !== "FREEFORM")) errors.push(freeformIssue("KBR-FREEFORM-FORMAT-PROFILE-MISMATCH", "freeform.loaded_profile_mismatch", { path: "/formatProfileId", actual: value.formatProfileId, expected: options.profile.formatProfileId }));
  if (!["MANUAL", "AGENT", "SAVED_CREATIVE"].includes(value.source as string)) errors.push(freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.plan_source_invalid", { path: "/source" }));
  if (!isRecord(value.background) || value.background.type === "SOLID" && !isHexColor(value.background.color) || value.background.type !== "SOLID" && value.background.type !== "TRANSPARENT") errors.push(freeformIssue("KBR-FREEFORM-BACKGROUND-COLOR-INVALID", "freeform.background_invalid", { path: "/background" }));
  if (!Array.isArray(value.elements)) return [...errors, freeformIssue("KBR-FREEFORM-PLAN-SCHEMA-INVALID", "freeform.elements_invalid", { path: "/elements" })];
  const ids = new Set<string>();
  value.elements.forEach((element, index) => {
    if (isRecord(element) && typeof element.id === "string") {
      if (ids.has(element.id)) errors.push(freeformIssue("KBR-FREEFORM-ELEMENT-ID-DUPLICATE", "freeform.element_id_duplicate", { path: `/elements/${index}/id`, elementId: element.id }));
      ids.add(element.id);
    }
    errors.push(...validateElement(element, `/elements/${index}`, options.fontRegistry));
  });
  return errors;
}

export function validateFreeformOutputFormat(format: OutputFormat, profile: FormatProfile): RendererValidationIssue[] {
  const normalized = format === "JPG" ? "JPEG" : format;
  const allowed = profile.allowedOutputFormats.map((entry) => entry === "JPG" ? "JPEG" : entry);
  return allowed.includes(normalized)
    ? []
    : [freeformIssue("KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "freeform.output_format_not_supported", { path: "/output/format", actual: format, expected: allowed })];
}

export function applyCreativeLayoutPlanDefaults(plan: CreativeLayoutPlan): CreativeLayoutPlan {
  return {
    ...plan,
    elements: plan.elements.map((element) => ({
      ...element,
      ...(element.opacity === undefined ? { opacity: FREEFORM_DEFAULT_OPACITY } : {}),
      ...(element.type === "TEXT" && element.letterSpacingPx === undefined ? { letterSpacingPx: FREEFORM_DEFAULT_LETTER_SPACING_PX } : {}),
    })),
  };
}

export function stableSortCreativeElements(elements: readonly CreativeElement[]): CreativeElement[] {
  return elements.map((element, index) => ({ element, index })).sort((a, b) => a.element.zIndex - b.element.zIndex || a.index - b.index).map(({ element }) => element);
}

export function validateFontReference(fontId: string, registry: FreeformFontRegistry, path = "/fontId", resolvedAssetDigest?: string): RendererValidationIssue[] {
  const entry = registry.entries.find((candidate) => candidate.fontId === fontId);
  if (!entry) return [freeformIssue("KBR-FONT-NOT-REGISTERED", "font.not_registered", { path, actual: fontId })];
  if (entry.status !== "RESOLVED_ASSET" || !entry.assetPath || !entry.sha256) return [freeformIssue("KBR-FONT-ASSET-MISSING", "font.asset_missing", { path, actual: fontId })];
  if (resolvedAssetDigest !== undefined && resolvedAssetDigest.toLowerCase() !== entry.sha256.toLowerCase()) return [freeformIssue("KBR-FONT-ASSET-DIGEST-MISMATCH", "font.asset_digest_mismatch", { path, actual: resolvedAssetDigest, expected: entry.sha256 })];
  return [];
}

function normalizeNfc(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map((item) => normalizeNfc(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeNfc(item)]));
  return value;
}

function canonicalizeColors(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeColors(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (key === "color" || key === "fillColor") && typeof item === "string" ? item.toUpperCase() : canonicalizeColors(item)]));
  return value;
}

export function canonicalFreeformPlan(plan: CreativeLayoutPlan): string {
  const serialized = canonicalize(normalizeNfc(canonicalizeColors(applyCreativeLayoutPlanDefaults(plan))));
  if (serialized === undefined) throw new Error("FREEFORM plan cannot be serialized as RFC 8785 JCS");
  return serialized;
}

function pixelFingerprintMaterial(plan: CreativeLayoutPlan, assetDigests: Readonly<Record<string, string>>, profile?: FormatProfile, outputEncoding?: unknown): unknown {
  const background = plan.background.type === "SOLID" ? { type: "SOLID", color: plan.background.color.toUpperCase() } : plan.background;
  return {
    formatProfileId: plan.formatProfileId,
    ...(profile?.profileVersion !== undefined ? { profileVersion: profile.profileVersion } : {}),
    canvas: profile?.canvas,
    ...(outputEncoding !== undefined ? { outputEncoding } : {}),
    background,
    elements: stableSortCreativeElements(plan.elements).map((element) => {
      const base = { id: element.id, type: element.type, bounds: element.bounds, zIndex: element.zIndex, opacity: element.opacity ?? FREEFORM_DEFAULT_OPACITY, role: element.role, safeZoneImportance: element.safeZoneImportance };
      if (element.type === "TEXT") return { ...base, text: element.text, fontId: element.fontId, fontDigest: assetDigests[element.fontId] ?? "", fontSizePx: element.fontSizePx, color: element.color.toUpperCase(), lineHeightPx: element.lineHeightPx, textAlign: element.textAlign, verticalAlign: element.verticalAlign, wrapMode: element.wrapMode, overflowMode: element.overflowMode, letterSpacingPx: element.letterSpacingPx ?? FREEFORM_DEFAULT_LETTER_SPACING_PX };
      if (element.type === "SHAPE") return { ...base, shape: element.shape, fillColor: element.fillColor.toUpperCase() };
      return { ...base, assetId: element.assetId, assetDigest: assetDigests[element.assetId] ?? "", placement: { policy: element.placement.policy, fitMode: element.placement.fitMode, cropRect: element.placement.cropRect, focalPoint: element.placement.focalPoint, anchor: element.placement.anchor, subjectProtection: element.placement.subjectProtection, cropCandidateId: element.placement.cropCandidateId, protectedSubjects: element.placement.protectedSubjects } };
    }),
  };
}

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeFreeformFingerprints(
  plan: CreativeLayoutPlan,
  assetDigests: Readonly<Record<string, string>>,
  profile?: FormatProfile,
  provenance: Readonly<Record<string, unknown>> = {},
): Promise<{ pixelFingerprint: string; requestFingerprint: string }> {
  const canonicalPlan = canonicalFreeformPlan(plan);
  const requestFingerprint = await sha256Text(canonicalize(normalizeNfc(canonicalizeColors({ plan: applyCreativeLayoutPlanDefaults(plan), provenance }))) ?? canonicalPlan);
  const pixelFingerprint = await sha256Text(canonicalize(normalizeNfc(pixelFingerprintMaterial(applyCreativeLayoutPlanDefaults(plan), assetDigests, profile, provenance.outputEncoding))) ?? canonicalPlan);
  return { pixelFingerprint, requestFingerprint };
}
