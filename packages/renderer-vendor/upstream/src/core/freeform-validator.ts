import {
  guardCompositionDispatch,
  validateCreativeLayoutPlan,
  validateFreeformOutputFormat,
  type CreativeLayoutPlan,
  type FormatProfile,
  type FreeformFontRegistry,
  type RendererValidationIssue,
} from "@kbr/renderer-contract";

import type { ContractBundle } from "./contracts.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import { sha256Bytes } from "./hash.js";
import {
  isMetaPlacementContext,
  resolveMetaPlacementContext,
  META_PLACEMENT_CONTEXTS,
} from "./meta-placement-context.js";
import { inspectPngIhdr, inspectRenderedArtifact } from "./raster.js";
import type {
  FreeformAppliedElement,
  Severity,
  ValidationIssue,
  ValidationStage,
} from "./types.js";

export type FreeformAssetValidationMetadata = Readonly<{
  assetId: string;
  digest: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
  visibleAlpha: boolean;
  opaqueBackgroundSuspected: boolean;
}>;

export type FreeformPreRenderValidationOptions = Readonly<{
  contracts: ContractBundle;
  formatProfile?: FormatProfile;
  fontRegistry?: FreeformFontRegistry;
  resolvedAssets?: ReadonlyMap<string, FreeformAssetValidationMetadata>;
}>;

export type FreeformPostRenderValidationOptions = Readonly<{
  contracts: ContractBundle;
  profile: FormatProfile;
  plan: CreativeLayoutPlan;
  appliedElements: readonly FreeformAppliedElement[];
  resolvedAssets?: ReadonlyMap<string, FreeformAssetValidationMetadata>;
  fontDigests?: Readonly<Record<string, string>>;
  png?: Buffer | null;
  artifact?: Buffer | null;
  artifactFormat?: "PNG" | "JPEG";
  expectedArtifactChecksumSha256?: string;
}>;

type RecordValue = Record<string, unknown>;

const REQUEST_KEYS = [
  "schemaVersion",
  "assetProfileId",
  "formatProfileId",
  "layoutMode",
  "creativeLayoutPlan",
  "assets",
  "output",
  "provenance",
  "metaStatic",
  "placementSet",
  "platformCopy",
  "placementContext",
] as const;
const ASSET_KEYS = [
  "assetId",
  "mimeType",
  "declaredWidth",
  "declaredHeight",
  "checksumSha256",
  "expectedSha256",
  "assetRef",
  "path",
  "bytes",
] as const;
const ASSET_REF_KEYS = ["type", "value"] as const;
const OUTPUT_KEYS = ["mimeType", "format", "quality", "directory", "baseName", "overwrite"] as const;
const META_STATIC_KEYS = ["mode", "placementContext", "conceptId", "variantId", "projectPixelPresetId", "platformCopy", "variants"] as const;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasUnknownKeys(value: RecordValue, allowed: readonly string[]): string[] {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).filter((key) => !allowedKeys.has(key));
}

function outputFormat(request: RecordValue): unknown {
  const output = isRecord(request.output) ? request.output : undefined;
  if (output?.format !== undefined) return output.format === "JPG" ? "JPEG" : output.format;
  return output?.mimeType === "image/jpeg" ? "JPG" : "PNG";
}

function requestedOutputFormat(request: RecordValue): "PNG" | "JPEG" {
  const output = isRecord(request.output) ? request.output : undefined;
  if (output?.format === "JPEG" || output?.format === "JPG" || output?.mimeType === "image/jpeg") return "JPEG";
  return "PNG";
}

function issue(
  contracts: ContractBundle,
  code: string,
  path: string,
  detail: {
    severity?: Severity;
    expected?: unknown;
    actual?: unknown;
    elementId?: string | undefined;
    assetId?: string | undefined;
    formatProfileId?: string | undefined;
    stage?: ValidationStage;
  } = {},
): ValidationIssue {
  return createIssue(contracts.errorRegistry, code, path, {
    ...(detail.expected !== undefined ? { expected: detail.expected } : {}),
    ...(detail.actual !== undefined ? { actual: detail.actual } : {}),
    ...(detail.elementId !== undefined ? { elementId: detail.elementId } : {}),
    ...(detail.assetId !== undefined ? { assetId: detail.assetId } : {}),
    ...(detail.formatProfileId !== undefined ? { formatProfileId: detail.formatProfileId } : {}),
    stage: detail.stage ?? "PRE_RENDER",
  });
}

function mapPlanIssues(
  contracts: ContractBundle,
  values: readonly RendererValidationIssue[],
  formatProfileId?: string,
): ValidationIssue[] {
  return values.map((value) => issue(contracts, value.code, value.path ?? "/creativeLayoutPlan", {
    ...(value.actual !== undefined ? { actual: value.actual } : {}),
    ...(value.expected !== undefined ? { expected: value.expected } : {}),
    ...(value.elementId !== undefined ? { elementId: value.elementId } : {}),
    ...(value.assetId !== undefined ? { assetId: value.assetId } : {}),
    ...(formatProfileId !== undefined ? { formatProfileId } : {}),
  }));
}

function validateRequestShape(request: unknown, contracts: ContractBundle): ValidationIssue[] {
  if (!isRecord(request)) return [issue(contracts, "KBR-INPUT-002", "/", { actual: typeof request })];
  const issues: ValidationIssue[] = [];
  const unknownRequestKeys = hasUnknownKeys(request, REQUEST_KEYS);
  if (unknownRequestKeys.length > 0) {
    issues.push(issue(contracts, "KBR-INPUT-002", "/", { actual: unknownRequestKeys, expected: REQUEST_KEYS }));
  }
  if (request.layoutMode !== "FREEFORM") {
    issues.push(issue(contracts, "KBR-FREEFORM-LAYOUT-MODE-MISMATCH", "/layoutMode", { actual: request.layoutMode, expected: "FREEFORM" }));
  }
  if (typeof request.formatProfileId !== "string" || request.formatProfileId.length === 0) {
    issues.push(issue(contracts, "KBR-FREEFORM-FORMAT-PROFILE-NOT-FOUND", "/formatProfileId", { actual: request.formatProfileId }));
  }
  if (request.schemaVersion !== undefined && !["1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"].includes(request.schemaVersion as string)) {
    issues.push(issue(contracts, "KBR-INPUT-002", "/schemaVersion", { actual: request.schemaVersion, expected: ["1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"] }));
  }
  if (request.creativeLayoutPlan === undefined) {
    issues.push(issue(contracts, "KBR-FREEFORM-PLAN-MISSING", "/creativeLayoutPlan"));
  }
  if (request.placementContext !== undefined && typeof request.placementContext !== "string") {
    issues.push(issue(contracts, "KBR-INPUT-002", "/placementContext", { actual: typeof request.placementContext }));
  }

  const context = resolveMetaPlacementContext(request);
  if (context.conflict) {
    issues.push(issue(contracts, "KBR-INPUT-002", "/placementContext", {
      actual: { placementContext: request.placementContext, metaStaticPlacementContext: context.legacyNestedValue },
      expected: "one canonical request-level placementContext; nested legacy value must match",
    }));
  }
  if (context.requested !== null && !isMetaPlacementContext(context.requested)) {
    issues.push(issue(contracts, "KBR-INPUT-002", context.path ?? "/placementContext", {
      actual: context.requested,
      expected: META_PLACEMENT_CONTEXTS,
    }));
  }

  if (request.metaStatic !== undefined) {
    if (!isRecord(request.metaStatic)) {
      issues.push(issue(contracts, "KBR-INPUT-002", "/metaStatic", { actual: typeof request.metaStatic }));
    } else {
      const unknownMetaKeys = hasUnknownKeys(request.metaStatic, META_STATIC_KEYS);
      if (unknownMetaKeys.length > 0) issues.push(issue(contracts, "KBR-INPUT-002", "/metaStatic", { actual: unknownMetaKeys, expected: META_STATIC_KEYS }));
      if (request.metaStatic.placementContext !== undefined && typeof request.metaStatic.placementContext !== "string") {
        issues.push(issue(contracts, "KBR-INPUT-002", "/metaStatic/placementContext", { actual: typeof request.metaStatic.placementContext }));
      }
    }
  }

  if (request.output !== undefined) {
    if (!isRecord(request.output)) {
      issues.push(issue(contracts, "KBR-INPUT-002", "/output", { actual: typeof request.output }));
    } else {
      const unknownOutputKeys = hasUnknownKeys(request.output, OUTPUT_KEYS);
      if (unknownOutputKeys.length > 0) issues.push(issue(contracts, "KBR-INPUT-002", "/output", { actual: unknownOutputKeys, expected: OUTPUT_KEYS }));
      if (request.output.format !== undefined && typeof request.output.format !== "string") issues.push(issue(contracts, "KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "/output/format", { actual: request.output.format }));
      if (request.output.mimeType !== undefined && !["image/png", "image/jpeg"].includes(request.output.mimeType as string)) issues.push(issue(contracts, "KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "/output/mimeType", { actual: request.output.mimeType }));
      if ((request.output.format === "PNG" && request.output.mimeType === "image/jpeg") || ((request.output.format === "JPG" || request.output.format === "JPEG") && request.output.mimeType === "image/png")) {
        issues.push(issue(contracts, "KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "/output", { actual: { format: request.output.format, mimeType: request.output.mimeType }, expected: "format and mimeType agree" }));
      }
      if (request.output.quality !== undefined && request.output.quality !== "AUTO_FIT" && (!isFiniteNumber(request.output.quality) || request.output.quality < 0 || request.output.quality > 100)) issues.push(issue(contracts, "KBR-INPUT-002", "/output/quality", { actual: request.output.quality, expected: "AUTO_FIT or 0..100" }));
    }
  }

  if (request.assets !== undefined) {
    const values: Array<[string, unknown]> = Array.isArray(request.assets)
      ? request.assets.map((value, index) => [String(index), value])
      : isRecord(request.assets)
        ? Object.entries(request.assets)
        : [];
    if (!Array.isArray(request.assets) && !isRecord(request.assets)) {
      issues.push(issue(contracts, "KBR-INPUT-002", "/assets", { actual: typeof request.assets }));
    }
    const ids = new Set<string>();
    for (const [indexOrId, raw] of values) {
      if (Array.isArray(request.assets)) {
        if (!isRecord(raw)) {
          issues.push(issue(contracts, "KBR-INPUT-002", `/assets/${indexOrId}`, { actual: typeof raw }));
          continue;
        }
        const assetId = raw.assetId;
        if (typeof assetId !== "string" || assetId.length === 0) issues.push(issue(contracts, "KBR-ASSET-NOT-FOUND", `/assets/${indexOrId}/assetId`));
        else if (ids.has(assetId)) issues.push(issue(contracts, "KBR-ASSET-NOT-FOUND", `/assets/${indexOrId}/assetId`, { assetId, actual: "duplicate assetId" }));
        else ids.add(assetId);
        const unknown = hasUnknownKeys(raw, ASSET_KEYS);
        if (unknown.length > 0) issues.push(issue(contracts, "KBR-INPUT-002", `/assets/${indexOrId}`, { actual: unknown, expected: ASSET_KEYS }));
        validateAssetValue(raw, `/assets/${indexOrId}`, issues, contracts);
      } else {
        if (typeof raw !== "string" && !isRecord(raw)) {
          issues.push(issue(contracts, "KBR-INPUT-002", `/assets/${indexOrId}`, { actual: typeof raw }));
          continue;
        }
        const assetId = indexOrId;
        if (!assetId) issues.push(issue(contracts, "KBR-ASSET-NOT-FOUND", `/assets/${indexOrId}`));
        if (isRecord(raw)) {
          const unknown = hasUnknownKeys(raw, ASSET_KEYS.filter((key) => key !== "assetId"));
          if (unknown.length > 0) issues.push(issue(contracts, "KBR-INPUT-002", `/assets/${indexOrId}`, { actual: unknown, expected: ASSET_KEYS.filter((key) => key !== "assetId") }));
          validateAssetValue(raw, `/assets/${indexOrId}`, issues, contracts);
        }
      }
    }
  }
  return issues;
}

function validateAssetValue(value: RecordValue, path: string, issues: ValidationIssue[], contracts: ContractBundle): void {
  if (value.assetRef !== undefined) {
    if (!isRecord(value.assetRef)) issues.push(issue(contracts, "KBR-INPUT-002", `${path}/assetRef`, { actual: typeof value.assetRef }));
    else {
      const unknown = hasUnknownKeys(value.assetRef, ASSET_REF_KEYS);
      if (unknown.length > 0) issues.push(issue(contracts, "KBR-INPUT-002", `${path}/assetRef`, { actual: unknown, expected: ASSET_REF_KEYS }));
      if (typeof value.assetRef.value !== "string" || value.assetRef.value.length === 0) issues.push(issue(contracts, "KBR-ASSET-REF-UNRESOLVED", `${path}/assetRef/value`));
      if (value.assetRef.type !== undefined && !["DESKTOP_ASSET_TOKEN", "INTEGRATION_ASSET_TOKEN", "FIXTURE_ASSET_ID"].includes(value.assetRef.type as string)) issues.push(issue(contracts, "KBR-ASSET-REF-UNRESOLVED", `${path}/assetRef/type`, { actual: value.assetRef.type }));
    }
  }
  if (value.mimeType !== undefined && !["image/png", "image/jpeg"].includes(value.mimeType as string)) issues.push(issue(contracts, "KBR-ASSET-MIME-NOT-ALLOWED", `${path}/mimeType`, { actual: value.mimeType }));
  for (const key of ["declaredWidth", "declaredHeight"] as const) {
    if (value[key] !== undefined && (!Number.isInteger(value[key]) || (value[key] as number) <= 0)) issues.push(issue(contracts, "KBR-ASSET-DIMENSION-MISMATCH", `${path}/${key}`, { actual: value[key] }));
  }
  for (const key of ["checksumSha256", "expectedSha256"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !/^[a-f0-9]{64}$/iu.test(value[key] as string))) issues.push(issue(contracts, "KBR-ASSET-CHECKSUM-MISMATCH", `${path}/${key}`, { actual: value[key], expected: "64 hexadecimal characters" }));
  }
  if (value.bytes !== undefined && !(value.bytes instanceof Uint8Array)) issues.push(issue(contracts, "KBR-INPUT-002", `${path}/bytes`, { actual: typeof value.bytes, expected: "Uint8Array" }));
}

function validatePlacementSemantics(
  element: RecordValue,
  elementPath: string,
  contracts: ContractBundle,
): ValidationIssue[] {
  if (element.type !== "IMAGE" && element.type !== "LOGO") return [];
  const placement = element.placement;
  if (!isRecord(placement)) return [];
  const issues: ValidationIssue[] = [];
  const elementId = typeof element.id === "string" ? element.id : undefined;
  const detail = elementId ? { elementId } : {};
  const hasCrop = placement.cropRect !== undefined;
  const hasFocal = placement.focalPoint !== undefined;
  const hasCandidate = placement.cropCandidateId !== undefined;
  const policy = placement.policy;
  const fitMode = placement.fitMode;
  if (["ALPHA_TRIM_CONTAIN", "CENTER_CONTAIN"].includes(policy as string)) {
    if (hasCrop || hasFocal || hasCandidate) issues.push(issue(contracts, "KBR-CROP-RECT-FORBIDDEN", `${elementPath}/placement`, { ...detail, expected: "no cropRect, focalPoint, or cropCandidateId" }));
    if (fitMode !== "CONTAIN") issues.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `${elementPath}/placement/fitMode`, { ...detail, actual: fitMode, expected: "CONTAIN" }));
  }
  if (policy === "MANUAL_CROP") {
    if (!hasCrop) issues.push(issue(contracts, "KBR-CROP-RECT-REQUIRED", `${elementPath}/placement/cropRect`, { ...detail, expected: "cropRect" }));
    if (hasFocal || hasCandidate) issues.push(issue(contracts, "KBR-CROP-RECT-FORBIDDEN", `${elementPath}/placement`, { ...detail, expected: "cropRect only" }));
    if (fitMode !== "COVER") issues.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `${elementPath}/placement/fitMode`, { ...detail, actual: fitMode, expected: "COVER" }));
    if (placement.source !== "MANUAL") issues.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `${elementPath}/placement/source`, { ...detail, actual: placement.source, expected: "MANUAL" }));
  }
  if (policy === "SEMANTIC_CROP_COVER") {
    if (!hasCrop && !hasFocal && !hasCandidate) issues.push(issue(contracts, "KBR-CROP-RECT-REQUIRED", `${elementPath}/placement`, { ...detail, expected: "cropRect, focalPoint, or selected cropCandidate" }));
    if (fitMode !== "COVER") issues.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `${elementPath}/placement/fitMode`, { ...detail, actual: fitMode, expected: "COVER" }));
  }
  if (hasCandidate) issues.push(issue(contracts, "KBR-CROP-CANDIDATE-NOT-FOUND", `${elementPath}/placement/cropCandidateId`, { ...detail, actual: placement.cropCandidateId }));
  return issues;
}

type MarginBox = { top?: number; right?: number; bottom?: number; left?: number };

function marginValues(value: unknown): MarginBox | null {
  if (!isRecord(value)) return null;
  const values = ["top", "right", "bottom", "left"] as const;
  const result: MarginBox = {};
  for (const key of values) if (typeof value[key] === "number" && Number.isFinite(value[key])) result[key] = value[key] as number;
  return Object.keys(result).length > 0 ? result : null;
}

function pixelRectIntersects(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function insideMargins(rect: { x: number; y: number; width: number; height: number }, canvas: { width: number; height: number }, margins: MarginBox): boolean {
  const top = margins.top ?? 0;
  const right = margins.right ?? 0;
  const bottom = margins.bottom ?? 0;
  const left = margins.left ?? 0;
  return rect.x >= left && rect.y >= top && rect.x + rect.width <= canvas.width - right && rect.y + rect.height <= canvas.height - bottom;
}

function validateMachineTextConstraints(
  plan: CreativeLayoutPlan,
  profile: FormatProfile,
  contracts: ContractBundle,
): ValidationIssue[] {
  const constraints = profile.textConstraints;
  if (!constraints || constraints.enforcement !== "MACHINE") return [];
  const issues: ValidationIssue[] = [];
  const declaredColors = new Set<string>();
  plan.elements.forEach((element, index) => {
    if (element.type !== "TEXT") return;
    const lineCount = element.wrapMode === "EXPLICIT_NEWLINES" ? element.text.split("\n").length : 1;
    if (constraints.maxLines !== undefined && lineCount > constraints.maxLines) {
      issues.push(issue(contracts, "KBR-FREEFORM-TEXT-LINES-EXCEEDED", `/creativeLayoutPlan/elements/${index}/text`, {
        elementId: element.id,
        actual: lineCount,
        expected: constraints.maxLines,
        formatProfileId: profile.formatProfileId,
      }));
    }
    if (constraints.maxFontSizePx !== undefined && element.fontSizePx > constraints.maxFontSizePx) {
      issues.push(issue(contracts, "KBR-FREEFORM-TEXT-FONT-SIZE-EXCEEDED", `/creativeLayoutPlan/elements/${index}/fontSizePx`, {
        elementId: element.id,
        actual: element.fontSizePx,
        expected: constraints.maxFontSizePx,
        formatProfileId: profile.formatProfileId,
      }));
    }
    declaredColors.add(element.color.toUpperCase());
  });
  if (constraints.maxDistinctColors !== undefined && declaredColors.size > constraints.maxDistinctColors) {
    issues.push(issue(contracts, "KBR-FREEFORM-TEXT-COLORS-EXCEEDED", "/creativeLayoutPlan/elements", {
      actual: declaredColors.size,
      expected: constraints.maxDistinctColors,
      formatProfileId: profile.formatProfileId,
    }));
  }
  return issues;
}

function validateManagedSafeZones(
  plan: CreativeLayoutPlan,
  profile: FormatProfile,
  contracts: ContractBundle,
  placementContext?: string,
): ValidationIssue[] {
  if (!isRecord(profile.safeZonePolicy)) return [];
  const policy = profile.safeZonePolicy;
  const issues: ValidationIssue[] = [];
  const managed = plan.elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.type === "TEXT" || element.type === "LOGO");
  const canvas = profile.canvas;
  const emit = (code: string, element: CreativeLayoutPlan["elements"][number], index: number, actual: unknown, expected: unknown) => {
    issues.push(issue(contracts, code, `/creativeLayoutPlan/elements/${index}/bounds`, {
      elementId: element.id,
      actual,
      expected,
      formatProfileId: profile.formatProfileId,
    }));
  };
  const storiesExclusion = isRecord(policy.storiesNormalizedExclusion)
    ? policy.storiesNormalizedExclusion
    : null;
  if (storiesExclusion && (placementContext === "FACEBOOK_STORIES" || placementContext === "INSTAGRAM_STORIES" || placementContext === "STORIES")) {
    const top = typeof storiesExclusion.top === "number" ? storiesExclusion.top : 0;
    const bottom = typeof storiesExclusion.bottom === "number" ? storiesExclusion.bottom : 0;
    const left = typeof storiesExclusion.left === "number" ? storiesExclusion.left : 0;
    const right = typeof storiesExclusion.right === "number" ? storiesExclusion.right : 0;
    const margins = { top: canvas.height * top, bottom: canvas.height * bottom, left: canvas.width * left, right: canvas.width * right };
    const keyRoles = new Set(["HEADLINE", "SUBCOPY", "ADVERTISER", "DISCLAIMER", "CTA", "LOGO"]);
    // Stories exclusion is a managed-overlay rule.  A full-bleed photo can
    // occupy the entire canvas without being an obstruction; only text/logo
    // overlays (or an explicitly KEY_CREATIVE element) are assessed.
    const storiesTargets = plan.elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => (element.type === "TEXT" || element.type === "LOGO") || element.safeZoneImportance === "KEY_CREATIVE");
    for (const { element, index } of storiesTargets) {
      if (element.safeZoneImportance === "IGNORE" || element.safeZoneImportance === "DECORATIVE") continue;
      if (element.safeZoneImportance !== "KEY_CREATIVE" && !keyRoles.has(element.role ?? "")) continue;
      const rect = normalizedRectToPixelRect(element.bounds, canvas);
      if (!insideMargins(rect, canvas, margins)) emit("KBR-META-STORIES-SAFE-ZONE-WARNING", element, index, rect, {
        normalizedExclusion: { top, bottom, left, right },
        pixelExclusion: margins,
        canvas,
      });
    }
  }
  const checkMargins = (rawMargins: unknown, severityCode: "KBR-FREEFORM-SAFE-ZONE-VIOLATION" | "KBR-FREEFORM-SAFE-ZONE-RECOMMENDED", label: string) => {
    const margins = marginValues(rawMargins);
    if (!margins) return;
    for (const { element, index } of managed) {
      const rect = normalizedRectToPixelRect(element.bounds, canvas);
      if (!insideMargins(rect, canvas, margins)) emit(severityCode, element, index, rect, { label, margins, canvas });
    }
  };
  // ACTUAL_RASTER_BOUNDS policies are deliberately checked only after the
  // isolated element has been rasterized.  Bounds in the input plan are not
  // allowed to move, scale, crop, or otherwise alter the creative.
  if (policy.enforcement !== "ACTUAL_RASTER_BOUNDS") {
    checkMargins(policy.required, "KBR-FREEFORM-SAFE-ZONE-VIOLATION", "required");
    checkMargins(policy.avoid, "KBR-FREEFORM-SAFE-ZONE-RECOMMENDED", "recommended");
    checkMargins(policy.lowResolutionRecommended, "KBR-FREEFORM-SAFE-ZONE-RECOMMENDED", "lowResolutionRecommended");
    checkMargins(policy.edgeSafeZone, "KBR-FREEFORM-SAFE-ZONE-VIOLATION", "edgeSafeZone");
  }
  if (policy.enforcement !== "ACTUAL_RASTER_BOUNDS" && isRecord(policy.closeButtonArea) && policy.closeButtonArea.position === "TOP_RIGHT") {
    const width = typeof policy.closeButtonArea.width === "number" ? policy.closeButtonArea.width : 0;
    const height = typeof policy.closeButtonArea.height === "number" ? policy.closeButtonArea.height : 0;
    const closeArea = { x: canvas.width - width, y: 0, width, height };
    for (const { element, index } of managed) {
      const rect = normalizedRectToPixelRect(element.bounds, canvas);
      if (pixelRectIntersects(rect, closeArea)) emit("KBR-FREEFORM-SAFE-ZONE-VIOLATION", element, index, rect, { label: "closeButtonArea", closeArea });
    }
  }
  if (typeof policy.rightBottomOcclusion === "string" || policy.status === "DIMENSION_KNOWN_POSITION_NOT_CATALOGED" || policy.position === "MANUAL_REVIEW_REQUIRED" || policy.ctaArea === "CTA_SAFE_ZONE_GEOMETRY_NOT_CATALOGED") {
    issues.push(issue(contracts, "KBR-FREEFORM-MANUAL-REVIEW-REQUIRED", "/formatProfileId/safeZonePolicy", {
      expected: policy,
      actual: "geometry-not-fully-cataloged",
      formatProfileId: profile.formatProfileId,
    }));
  }
  if (policy.bakedImageContent === "MANUAL_REVIEW_REQUIRED" && plan.elements.some((element) => element.type === "IMAGE")) {
    issues.push(issue(contracts, "KBR-FREEFORM-MANUAL-REVIEW-REQUIRED", "/creativeLayoutPlan/elements", {
      expected: "baked-image semantic safe-zone review",
      actual: "IMAGE content is not OCR/CV analyzed",
      formatProfileId: profile.formatProfileId,
    }));
  }
  return issues;
}

function validateActualRasterConstraints(
  plan: CreativeLayoutPlan,
  profile: FormatProfile,
  appliedElements: readonly FreeformAppliedElement[],
  contracts: ContractBundle,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const textConstraints = profile.textConstraints;
  const policy = isRecord(profile.safeZonePolicy) ? profile.safeZonePolicy : null;
  const actualSafeZone = policy?.enforcement === "ACTUAL_RASTER_BOUNDS";
  const managedTypes = policy && Array.isArray(policy.managedElementTypes)
    ? policy.managedElementTypes.filter((value): value is "TEXT" | "LOGO" => value === "TEXT" || value === "LOGO")
    : ["TEXT", "LOGO"] as const;
  const requiredMargins = marginValues(policy?.required);
  const imageMargins = marginValues(policy?.imageRequired);
  plan.elements.forEach((element) => {
    const appliedIndex = appliedElements.findIndex((candidate) => candidate.elementId === element.id);
    const applied = appliedIndex >= 0 ? appliedElements[appliedIndex] : undefined;
    if (!applied) return;
    const raster = applied.actualRasterBounds ?? applied.destinationPixelRect;
    if (element.type === "TEXT" && textConstraints?.enforcement === "MACHINE" && textConstraints.minRasterHeightPx !== undefined) {
      const actualRasterHeight = applied.actualRasterBounds?.height ?? 0;
      if (actualRasterHeight < textConstraints.minRasterHeightPx) {
        issues.push(issue(contracts, "KBR-FREEFORM-TEXT-RASTER-HEIGHT-BELOW-MINIMUM", `/appliedElements/${appliedIndex}/actualRasterBounds`, {
          elementId: element.id,
          actual: actualRasterHeight,
          expected: textConstraints.minRasterHeightPx,
          formatProfileId: profile.formatProfileId,
          stage: "POST_RENDER",
        }));
      }
    }
    if (!actualSafeZone) return;
    const shouldCheckManaged = (element.type === "TEXT" || element.type === "LOGO") && managedTypes.includes(element.type);
    const shouldCheckImage = (element.type === "IMAGE" || element.type === "LOGO") && imageMargins !== null;
    if (shouldCheckManaged && requiredMargins && !insideMargins(raster, profile.canvas, requiredMargins)) {
      issues.push(issue(contracts, "KBR-FREEFORM-SAFE-ZONE-VIOLATION", `/appliedElements/${appliedIndex}/actualRasterBounds`, {
        elementId: element.id,
        actual: raster,
        expected: { label: "required", margins: requiredMargins, canvas: profile.canvas },
        formatProfileId: profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
    if (shouldCheckImage && imageMargins && !insideMargins(raster, profile.canvas, imageMargins)) {
      issues.push(issue(contracts, "KBR-FREEFORM-SAFE-ZONE-VIOLATION", `/appliedElements/${appliedIndex}/actualRasterBounds`, {
        elementId: element.id,
        actual: raster,
        expected: { label: "imageRequired", margins: imageMargins, canvas: profile.canvas },
        formatProfileId: profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
  });
  return issues;
}

function validateProfileAndPlan(
  request: unknown,
  options: FreeformPreRenderValidationOptions,
): ValidationIssue[] {
  const contracts = options.contracts;
  const issues = validateRequestShape(request, contracts);
  if (!isRecord(request)) return sortAndDedupeIssues(issues);
  const formatProfileId = typeof request.formatProfileId === "string" ? request.formatProfileId : undefined;
  const profile = options.formatProfile;
  if (formatProfileId && !profile) issues.push(issue(contracts, "KBR-FREEFORM-FORMAT-PROFILE-NOT-FOUND", "/formatProfileId", { actual: formatProfileId, formatProfileId }));
  if (profile && profile.layoutMode !== "FREEFORM") issues.push(issue(contracts, "KBR-FREEFORM-LAYOUT-MODE-MISMATCH", "/formatProfileId", { actual: profile.layoutMode, expected: "FREEFORM", formatProfileId }));
  if (profile) {
    const compositionGuard = guardCompositionDispatch({ compositionMode: profile.compositionMode ?? "RENDERER_COMPOSED" });
    if (!compositionGuard.allowed) issues.push(issue(contracts, compositionGuard.code, "/compositionMode", { actual: profile.compositionMode, formatProfileId }));
  }
  if (profile && (!Number.isInteger(profile.canvas.width) || !Number.isInteger(profile.canvas.height) || profile.canvas.width <= 0 || profile.canvas.height <= 0)) issues.push(issue(contracts, "KBR-FREEFORM-CANVAS-PROFILE-MISSING", "/formatProfileId", { actual: profile.canvas, formatProfileId }));
  if (profile && profile.implementationStatus !== "IMPLEMENTED") issues.push(issue(contracts, "KBR-FREEFORM-FORMAT-NOT-IMPLEMENTED", "/formatProfileId", { actual: profile.implementationStatus, expected: "IMPLEMENTED", formatProfileId }));
  if (profile && formatProfileId && profile.formatProfileId !== formatProfileId) issues.push(issue(contracts, "KBR-FREEFORM-FORMAT-PROFILE-MISMATCH", "/formatProfileId", { actual: formatProfileId, expected: profile.formatProfileId, formatProfileId }));
  if (profile?.outputConstraints && (!isRecord(request.output) || (request.output.format === undefined && request.output.mimeType === undefined))) {
    issues.push(issue(contracts, "KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "/output/format", { actual: "omitted", expected: ["PNG", "JPEG"], formatProfileId }));
  }
  if (profile && isRecord(request.output)) {
    issues.push(...mapPlanIssues(contracts, validateFreeformOutputFormat(outputFormat(request) as never, profile), formatProfileId));
    const constraints = profile.outputConstraints;
    if (constraints && !constraints.allowedFormats.includes(requestedOutputFormat(request))) {
      issues.push(issue(contracts, "KBR-FREEFORM-OUTPUT-FORMAT-NOT-SUPPORTED", "/output/format", { actual: requestedOutputFormat(request), expected: constraints.allowedFormats, formatProfileId }));
    }
    if (requestedOutputFormat(request) === "JPEG" && isRecord(request.creativeLayoutPlan) && isRecord(request.creativeLayoutPlan.background) && request.creativeLayoutPlan.background.type === "TRANSPARENT") {
      issues.push(issue(contracts, "KBR-FREEFORM-JPEG-TRANSPARENT-BACKGROUND-NOT-SUPPORTED", "/creativeLayoutPlan/background/type", { actual: "TRANSPARENT", expected: "SOLID for JPEG", formatProfileId }));
    }
  }
  if (request.creativeLayoutPlan !== undefined) {
    if (isRecord(request.creativeLayoutPlan) && isRecord(request.creativeLayoutPlan.background)) {
      const backgroundType = request.creativeLayoutPlan.background.type;
      if (backgroundType !== "TRANSPARENT" && backgroundType !== "SOLID") {
        issues.push(issue(contracts, "KBR-FREEFORM-BACKGROUND-TYPE-NOT-SUPPORTED", "/creativeLayoutPlan/background/type", { actual: backgroundType, expected: ["TRANSPARENT", "SOLID"], formatProfileId }));
      }
    }
    issues.push(...mapPlanIssues(contracts, validateCreativeLayoutPlan(request.creativeLayoutPlan, {
      ...(formatProfileId ? { formatProfileId } : {}),
      ...(profile ? { profile } : {}),
      ...(options.fontRegistry ? { fontRegistry: options.fontRegistry } : {}),
      requireProfile: true,
    }), formatProfileId));
    if (isRecord(request.creativeLayoutPlan) && Array.isArray(request.creativeLayoutPlan.elements)) {
      request.creativeLayoutPlan.elements.forEach((element, index) => {
        if (isRecord(element)) {
          issues.push(...validatePlacementSemantics(element, `/creativeLayoutPlan/elements/${index}`, contracts));
          const constraints = profile?.elementConstraints;
          if (constraints) {
            const allowed = element.type === "IMAGE" ? constraints.allowImage : element.type === "TEXT" ? constraints.allowText : element.type === "LOGO" ? constraints.allowLogo : constraints.allowShape ?? false;
            if (!allowed) issues.push(issue(contracts, "KBR-FREEFORM-ELEMENT-NOT-ALLOWED-FOR-PROFILE", `/creativeLayoutPlan/elements/${index}/type`, { elementId: typeof element.id === "string" ? element.id : undefined, actual: element.type, expected: constraints, formatProfileId }));
          }
        }
      });
      if (profile) {
        const typedPlan = request.creativeLayoutPlan as unknown as CreativeLayoutPlan;
        const placementContext = resolveMetaPlacementContext(request).resolved ?? undefined;
        issues.push(...validateManagedSafeZones(typedPlan, profile, contracts, placementContext));
        issues.push(...validateMachineTextConstraints(typedPlan, profile, contracts));
      }
    }
  }
  return sortAndDedupeIssues(issues);
}

function validateResolvedAssets(
  request: unknown,
  options: FreeformPreRenderValidationOptions,
): ValidationIssue[] {
  const resolvedAssets = options.resolvedAssets;
  if (!isRecord(request) || !isRecord(request.creativeLayoutPlan) || !Array.isArray(request.creativeLayoutPlan.elements) || !resolvedAssets) return [];
  const issues: ValidationIssue[] = [];
  const referenced = new Set<string>();
  request.creativeLayoutPlan.elements.forEach((rawElement, index) => {
    if (!isRecord(rawElement) || (rawElement.type !== "IMAGE" && rawElement.type !== "LOGO")) return;
    const elementId = typeof rawElement.id === "string" ? rawElement.id : undefined;
    const assetId = typeof rawElement.assetId === "string" ? rawElement.assetId : undefined;
    if (!assetId) return;
    referenced.add(assetId);
    const asset = resolvedAssets.get(assetId);
    if (!asset) {
      issues.push(issue(options.contracts, "KBR-FREEFORM-IMAGE-ASSET-NOT-FOUND", `/creativeLayoutPlan/elements/${index}/assetId`, { elementId, assetId }));
      return;
    }
    if (asset.width <= 0 || asset.height <= 0) issues.push(issue(options.contracts, "KBR-IMAGE-DIMENSION-INVALID", `/assets/${assetId}`, { elementId, assetId, actual: { width: asset.width, height: asset.height } }));
    if (rawElement.type === "LOGO") {
      if (asset.mimeType !== "image/png") issues.push(issue(options.contracts, "KBR-LOGO-ALPHA-REQUIRED", `/assets/${assetId}`, { elementId, assetId, actual: asset.mimeType, expected: "image/png" }));
      if (!asset.hasAlpha) issues.push(issue(options.contracts, "KBR-LOGO-ALPHA-REQUIRED", `/assets/${assetId}`, { elementId, assetId, expected: "PNG alpha channel" }));
      if (asset.opaqueBackgroundSuspected) issues.push(issue(options.contracts, "KBR-LOGO-TRANSPARENT-BACKGROUND-REQUIRED", `/assets/${assetId}`, { elementId, assetId, expected: "transparent background" }));
      if (!asset.visibleAlpha) issues.push(issue(options.contracts, "KBR-LOGO-EMPTY", `/assets/${assetId}`, { elementId, assetId, expected: "alpha >= 8 visible pixels" }));
    }
    if (rawElement.type === "IMAGE" && isRecord(rawElement.placement) && rawElement.placement.policy === "ALPHA_TRIM_CONTAIN" && !asset.hasAlpha) {
      issues.push(issue(options.contracts, "KBR-ALPHA-CHANNEL-REQUIRED", `/assets/${assetId}`, { elementId, assetId, expected: "alpha channel for ALPHA_TRIM_CONTAIN" }));
    }
  });
  for (const assetId of resolvedAssets.keys()) {
    if (!referenced.has(assetId)) issues.push(issue(options.contracts, "KBR-ASSET-UNUSED", `/assets/${assetId}`, { assetId }));
  }
  return issues;
}

export function validateFreeformPreRender(
  request: unknown,
  options: FreeformPreRenderValidationOptions,
): ValidationIssue[] {
  return sortAndDedupeIssues([
    ...validateProfileAndPlan(request, options),
    ...validateResolvedAssets(request, options),
  ]);
}

function normalizedRectToPixelRect(rect: { x: number; y: number; width: number; height: number }, canvas: { width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const x = Math.floor(rect.x * canvas.width);
  const y = Math.floor(rect.y * canvas.height);
  const right = Math.ceil((rect.x + rect.width) * canvas.width);
  const bottom = Math.ceil((rect.y + rect.height) * canvas.height);
  return { x, y, width: right - x, height: bottom - y };
}

function sameRect(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function pixelRectValid(rect: unknown, canvas: { width: number; height: number }): boolean {
  if (!isRecord(rect)) return false;
  const x = rect.x;
  const y = rect.y;
  const width = rect.width;
  const height = rect.height;
  return typeof x === "number"
    && typeof y === "number"
    && typeof width === "number"
    && typeof height === "number"
    && Number.isInteger(x)
    && Number.isInteger(y)
    && Number.isInteger(width)
    && Number.isInteger(height)
    && x >= 0
    && y >= 0
    && width > 0
    && height > 0
    && x + width <= canvas.width
    && y + height <= canvas.height;
}

function anchorOffset(anchor: string, slot: { x: number; y: number; width: number; height: number }, width: number, height: number): { x: number; y: number } {
  const freeX = slot.width - width;
  const freeY = slot.height - height;
  const horizontal = anchor.endsWith("LEFT") || anchor === "TOP_LEFT" || anchor === "BOTTOM_LEFT"
    ? 0
    : anchor.endsWith("RIGHT") || anchor === "TOP_RIGHT" || anchor === "BOTTOM_RIGHT"
      ? freeX
      : Math.floor(freeX / 2);
  const vertical = anchor.startsWith("TOP") || anchor === "TOP_LEFT" || anchor === "TOP_RIGHT"
    ? 0
    : anchor.startsWith("BOTTOM") || anchor === "BOTTOM_LEFT" || anchor === "BOTTOM_RIGHT"
      ? freeY
      : Math.floor(freeY / 2);
  return { x: slot.x + horizontal, y: slot.y + vertical };
}

function expectedDestinationRect(
  element: CreativeLayoutPlan["elements"][number],
  applied: FreeformAppliedElement,
  profile: FormatProfile,
  asset?: FreeformAssetValidationMetadata,
): { x: number; y: number; width: number; height: number } {
  const slot = normalizedRectToPixelRect(element.bounds, profile.canvas);
  if (element.type !== "IMAGE" && element.type !== "LOGO") return slot;
  const crop = applied.resolvedSourceCropPixels ?? (asset ? { x: 0, y: 0, width: asset.width, height: asset.height } : { x: 0, y: 0, width: 1, height: 1 });
  const cover = element.placement.fitMode === "COVER" || element.placement.policy === "SEMANTIC_CROP_COVER";
  const scale = cover
    ? Math.max(slot.width / crop.width, slot.height / crop.height)
    : Math.min(slot.width / crop.width, slot.height / crop.height);
  const resizedWidth = Math.max(1, Math.round(crop.width * scale));
  const resizedHeight = Math.max(1, Math.round(crop.height * scale));
  if (cover) return slot;
  const destination = anchorOffset(element.placement.anchor, slot, resizedWidth, resizedHeight);
  return { x: destination.x, y: destination.y, width: resizedWidth, height: resizedHeight };
}

export function validateFreeformAppliedElements(
  plan: CreativeLayoutPlan,
  profile: FormatProfile,
  appliedElements: readonly FreeformAppliedElement[],
  contracts: ContractBundle,
  options: Pick<FreeformPostRenderValidationOptions, "resolvedAssets" | "fontDigests"> = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ordered = plan.elements
    .map((element, originalArrayIndex) => ({ element, originalArrayIndex }))
    .sort((left, right) => left.element.zIndex - right.element.zIndex || left.originalArrayIndex - right.originalArrayIndex);
  if (appliedElements.length !== ordered.length) {
    issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", "/appliedElements", { actual: appliedElements.length, expected: ordered.length, stage: "POST_RENDER" }));
  }
  ordered.forEach(({ element, originalArrayIndex }, index) => {
    const applied = appliedElements[index];
    if (!applied) return;
    const expectedRect = expectedDestinationRect(element, applied, profile, element.type === "IMAGE" || element.type === "LOGO" ? options.resolvedAssets?.get(element.assetId) : undefined);
    const canVerifyImageDestination = element.type === "TEXT"
      || element.type === "SHAPE"
      || ((element.type === "IMAGE" || element.type === "LOGO") && options.resolvedAssets?.has(element.assetId))
      || applied.resolvedSourceCropPixels !== undefined;
    const elementMismatch = applied.elementId !== element.id
      || applied.elementType !== element.type
      || applied.zIndex !== element.zIndex
      || applied.originalArrayIndex !== originalArrayIndex
      || !sameRect(applied.normalizedBounds, element.bounds);
    if (elementMismatch) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}`, { elementId: element.id, actual: applied, expected: { elementId: element.id, elementType: element.type, zIndex: element.zIndex, originalArrayIndex, normalizedBounds: element.bounds }, stage: "POST_RENDER" }));
    if ((!canVerifyImageDestination || !sameRect(applied.destinationPixelRect, expectedRect)) && !pixelRectValid(applied.destinationPixelRect, profile.canvas)) {
      issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-RECT-MISMATCH", `/appliedElements/${index}/destinationPixelRect`, { elementId: element.id, actual: applied.destinationPixelRect, expected: expectedRect, stage: "POST_RENDER" }));
    } else if (canVerifyImageDestination && !sameRect(applied.destinationPixelRect, expectedRect)) {
      issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-RECT-MISMATCH", `/appliedElements/${index}/destinationPixelRect`, { elementId: element.id, actual: applied.destinationPixelRect, expected: expectedRect, stage: "POST_RENDER" }));
    }
    if (applied.opacity !== (element.opacity ?? 1)) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}/opacity`, { elementId: element.id, actual: applied.opacity, expected: element.opacity ?? 1, stage: "POST_RENDER" }));
    if ((element.type === "IMAGE" || element.type === "LOGO")) {
      const asset = options.resolvedAssets?.get(element.assetId);
      if (applied.assetId !== element.assetId || (asset && applied.assetDigest !== asset.digest)) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}/assetId`, { elementId: element.id, assetId: element.assetId, actual: { assetId: applied.assetId, assetDigest: applied.assetDigest }, expected: { assetId: element.assetId, assetDigest: asset?.digest }, stage: "POST_RENDER" }));
      if (applied.placementPolicy !== element.placement.policy || applied.fitMode !== element.placement.fitMode) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}/placementPolicy`, { elementId: element.id, actual: { placementPolicy: applied.placementPolicy, fitMode: applied.fitMode }, expected: { placementPolicy: element.placement.policy, fitMode: element.placement.fitMode }, stage: "POST_RENDER" }));
      if (element.placement.cropRect && !sameRect(applied.requestedCropRect, element.placement.cropRect)) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}/requestedCropRect`, { elementId: element.id, actual: applied.requestedCropRect, expected: element.placement.cropRect, stage: "POST_RENDER" }));
      if (element.placement.policy !== "CENTER_CONTAIN" && !applied.resolvedSourceCropPixels) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-RECT-MISMATCH", `/appliedElements/${index}/resolvedSourceCropPixels`, { elementId: element.id, assetId: element.assetId, expected: "resolved source crop pixels", stage: "POST_RENDER" }));
      if (applied.resolvedSourceCropPixels && asset && !pixelRectValid(applied.resolvedSourceCropPixels, { width: asset.width, height: asset.height })) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-RECT-MISMATCH", `/appliedElements/${index}/resolvedSourceCropPixels`, { elementId: element.id, assetId: element.assetId, actual: applied.resolvedSourceCropPixels, expected: { width: asset.width, height: asset.height }, stage: "POST_RENDER" }));
    }
    if (element.type === "TEXT") {
      const expectedFontDigest = options.fontDigests?.[element.fontId];
      const textMismatch = applied.fontId !== element.fontId
        || (expectedFontDigest !== undefined && applied.fontAssetDigest !== expectedFontDigest)
        || applied.fontSizePx !== element.fontSizePx
        || applied.lineHeightPx !== element.lineHeightPx
        || applied.color !== element.color
        || applied.wrapMode !== element.wrapMode
        || applied.overflowMode !== element.overflowMode;
      if (textMismatch) issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}`, { elementId: element.id, actual: applied, expected: { fontId: element.fontId, fontAssetDigest: expectedFontDigest, fontSizePx: element.fontSizePx, lineHeightPx: element.lineHeightPx, color: element.color, wrapMode: element.wrapMode, overflowMode: element.overflowMode }, stage: "POST_RENDER" }));
      if (typeof applied.overflowDetected !== "boolean" || typeof applied.clipped !== "boolean") issues.push(issue(contracts, "KBR-FREEFORM-APPLIED-ELEMENT-MISMATCH", `/appliedElements/${index}/overflowDetected`, { elementId: element.id, actual: { overflowDetected: applied.overflowDetected, clipped: applied.clipped }, expected: "boolean flags", stage: "POST_RENDER" }));
    }
  });
  return sortAndDedupeIssues(issues);
}

export async function validateFreeformPostRender(options: FreeformPostRenderValidationOptions): Promise<ValidationIssue[]> {
  const issues = validateFreeformAppliedElements(options.plan, options.profile, options.appliedElements, options.contracts, options);
  issues.push(...validateActualRasterConstraints(options.plan, options.profile, options.appliedElements, options.contracts));
  const artifact = options.artifact ?? options.png;
  const artifactFormat = options.artifactFormat ?? "PNG";
  if (artifact === null || artifact === undefined || artifact.byteLength === 0) {
    issues.push(issue(options.contracts, "KBR-OUTPUT-001", artifactFormat === "JPEG" ? "/output.jpg" : "/output.png", { stage: "POST_RENDER" }));
  } else {
    const actualDigest = sha256Bytes(artifact);
    if (options.expectedArtifactChecksumSha256 !== undefined && actualDigest !== options.expectedArtifactChecksumSha256) issues.push(issue(options.contracts, "KBR-FREEFORM-VALIDATION-INTERNAL-MISMATCH", "/artifactChecksumSha256", { actual: actualDigest, expected: options.expectedArtifactChecksumSha256, stage: "POST_RENDER" }));
    const outputConstraints = options.profile.outputConstraints;
    const outputPath = artifactFormat === "JPEG" ? "/output.jpg" : "/output.png";
    if (outputConstraints?.minimumBytes !== undefined) {
      const meetsMinimum = outputConstraints.minimumBytesComparator === "GT"
        ? artifact.byteLength > outputConstraints.minimumBytes
        : artifact.byteLength >= outputConstraints.minimumBytes;
      if (!meetsMinimum) issues.push(issue(options.contracts, "KBR-FREEFORM-FILE-SIZE-BELOW-MINIMUM", outputPath, {
        actual: { bytes: artifact.byteLength },
        expected: { minimumBytes: outputConstraints.minimumBytes, comparator: outputConstraints.minimumBytesComparator ?? "GTE" },
        formatProfileId: options.profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
    if (outputConstraints?.maximumBytes !== undefined) {
      const withinMaximum = outputConstraints.maximumBytesComparator === "LT"
        ? artifact.byteLength < outputConstraints.maximumBytes
        : artifact.byteLength <= outputConstraints.maximumBytes;
      if (!withinMaximum) issues.push(issue(options.contracts, "KBR-FREEFORM-FILE-SIZE-EXCEEDED", outputPath, {
        actual: { bytes: artifact.byteLength },
        expected: { maximumBytes: outputConstraints.maximumBytes, comparator: outputConstraints.maximumBytesComparator ?? "LTE" },
        formatProfileId: options.profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
    if (artifactFormat === "PNG") {
      const ihdr = inspectPngIhdr(artifact);
      if (!ihdr) issues.push(issue(options.contracts, "KBR-OUTPUT-003", "/output.png", { expected: { format: "PNG", signature: true }, stage: "POST_RENDER" }));
      else if (ihdr.width !== options.profile.canvas.width || ihdr.height !== options.profile.canvas.height) issues.push(issue(options.contracts, "KBR-OUTPUT-002", "/output.png", { actual: { width: ihdr.width, height: ihdr.height }, expected: options.profile.canvas, stage: "POST_RENDER" }));
      else if (ihdr.bitDepth !== 8 || ihdr.colorType !== 6) issues.push(issue(options.contracts, "KBR-OUTPUT-003", "/output.png", { actual: { bitDepth: ihdr.bitDepth, colorType: ihdr.colorType }, expected: { bitDepth: 8, colorType: 6 }, stage: "POST_RENDER" }));
    } else {
      const inspected = await inspectRenderedArtifact(artifact, "JPEG", options.profile.canvas);
      if (!inspected.metadata || inspected.metadata.format !== "jpeg") issues.push(issue(options.contracts, "KBR-OUTPUT-003", "/output.jpg", { expected: { format: "JPEG" }, actual: inspected.metadata?.format, stage: "POST_RENDER" }));
      else if (inspected.width !== options.profile.canvas.width || inspected.height !== options.profile.canvas.height) issues.push(issue(options.contracts, "KBR-OUTPUT-002", "/output.jpg", { actual: { width: inspected.width, height: inspected.height }, expected: options.profile.canvas, stage: "POST_RENDER" }));
      if (outputConstraints?.requiresOpaqueOutput === true && inspected.metadata && !inspected.opaque) issues.push(issue(options.contracts, "KBR-FREEFORM-OPAQUE-OUTPUT-REQUIRED", "/output.jpg", {
        expected: "all final pixels alpha=255",
        actual: { hasAlpha: inspected.hasAlpha, opaque: inspected.opaque },
        formatProfileId: options.profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
    if (artifactFormat === "PNG" && outputConstraints?.requiresOpaqueOutput === true) {
      const inspected = await inspectRenderedArtifact(artifact, "PNG", options.profile.canvas);
      if (inspected.metadata && !inspected.opaque) issues.push(issue(options.contracts, "KBR-FREEFORM-OPAQUE-OUTPUT-REQUIRED", "/output.png", {
        expected: "all final pixels alpha=255",
        actual: { hasAlpha: inspected.hasAlpha, opaque: inspected.opaque },
        formatProfileId: options.profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
  }
  return sortAndDedupeIssues(issues);
}

export function validationIssuesHaveStage(issues: readonly ValidationIssue[], stage: ValidationStage): boolean {
  return issues.every((entry) => entry.stage === stage);
}
