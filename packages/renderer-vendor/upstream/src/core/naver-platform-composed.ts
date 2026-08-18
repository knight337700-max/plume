import type {
  ArtifactCardinality,
  MultiArtifactCollection,
  MultiArtifactCollectionItem,
  NaverGfaPlacement,
} from "@kbr/renderer-contract";

export const NAVER_PLATFORM_SOURCE_SCHEMA_VERSION = "1.1.0" as const;
export const NAVER_PLATFORM_SOURCE_PREVIOUS_SCHEMA_VERSION = "1.0.0" as const;
export type NaverPlatformSourceSchemaVersion = typeof NAVER_PLATFORM_SOURCE_SCHEMA_VERSION | typeof NAVER_PLATFORM_SOURCE_PREVIOUS_SCHEMA_VERSION;
export type PlatformSourceCountingUnit = "CHARACTER" | "BYTE" | "KOREAN_ENGLISH_WEIGHTED" | "GRAPHEME" | "UNRESOLVED";
export type PlatformSourceSeverity = "ERROR" | "WARNING" | "INFO";

export type PlatformComposedSourceSpec = Readonly<{
  schemaVersion: NaverPlatformSourceSchemaVersion;
  channel: "NAVER_GFA";
  placement: NaverGfaPlacement;
  compositionMode: "PLATFORM_COMPOSED";
  artifactCardinality: ArtifactCardinality;
  sourceProfileId: string;
  fields: Readonly<Record<string, unknown>>;
  assets: readonly PlatformSourceAsset[];
  collection?: MultiArtifactCollection;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type PlatformCollectionItem = MultiArtifactCollectionItem;

export type PlatformSourceAsset = Readonly<{
  assetId: string;
  assetRole: string;
  sourceProfileId: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256?: string;
  hasAlpha?: boolean;
  safeArea?: Readonly<{ x: number; y: number; width: number; height: number }>;
  pathRef?: string;
}>;

export type PlatformSourceFieldRule = Readonly<{
  id: string;
  aliases?: readonly string[];
  type?: "STRING" | "ENUM" | "BOOLEAN" | "URI" | string;
  required?: boolean | "UNRESOLVED";
  minLength?: number | null;
  maxLength?: number | null;
  maxLines?: number | null;
  maxCharactersPerLine?: number | null;
  countingUnit?: PlatformSourceCountingUnit;
  allowedValues?: readonly unknown[] | null;
  conditional?: string | null;
}>;

export type PlatformSourceAssetRule = Readonly<{
  id?: string;
  assetRole: string;
  required?: boolean | "UNRESOLVED";
  canvas?: Readonly<{
    width?: number;
    height?: number;
    minimumWidth?: number;
    aspectRatios?: readonly string[];
  }>;
  aspectRatio?: string;
  mime?: readonly string[];
  fileSize?: Readonly<{ minimumBytes?: number; maximumBytes?: number }>;
  alpha?: Readonly<{ allowed?: boolean | "UNRESOLVED" }>;
  safeArea?: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

export type PlatformComposedProfile = Readonly<{
  id: string;
  placement: NaverGfaPlacement;
  artifactCardinality: ArtifactCardinality;
  fields: readonly PlatformSourceFieldRule[];
  assets: readonly PlatformSourceAssetRule[];
  collection?: Readonly<{
    minimumItems?: number;
    maximumItems?: number;
    ordering?: "INPUT_ORDER_PRESERVED";
    itemFields?: readonly PlatformSourceFieldRule[];
    itemSourceProfileIds?: readonly string[];
  }>;
  runtimeStatus?: string;
}>;

export type PlatformSourceValidationIssue = Readonly<{
  code: string;
  severity: PlatformSourceSeverity;
  messageKey: string;
  path: string;
  actual?: unknown;
  expected?: unknown;
}>;

export type PlatformSourceValidationResult = Readonly<{
  status: "PASS" | "WARNING" | "ERROR";
  errors: readonly PlatformSourceValidationIssue[];
  warnings: readonly PlatformSourceValidationIssue[];
  info: readonly PlatformSourceValidationIssue[];
  normalized: PlatformComposedSourceSpec | null;
  finalUiRendered: false;
  pixelFingerprint: null;
}>;

const severityOrder: Record<PlatformSourceSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

function issue(
  code: string,
  severity: PlatformSourceSeverity,
  messageKey: string,
  path: string,
  actual?: unknown,
  expected?: unknown,
): PlatformSourceValidationIssue {
  return { code, severity, messageKey, path, ...(actual === undefined ? {} : { actual }), ...(expected === undefined ? {} : { expected }) };
}

function sortIssues(issues: readonly PlatformSourceValidationIssue[]): PlatformSourceValidationIssue[] {
  return [...issues].sort((a, b) => {
    const severity = severityOrder[a.severity] - severityOrder[b.severity];
    if (severity !== 0) return severity;
    const path = a.path.localeCompare(b.path);
    if (path !== 0) return path;
    const code = a.code.localeCompare(b.code);
    if (code !== 0) return code;
    return a.messageKey.localeCompare(b.messageKey);
  });
}

function valueIsMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.length === 0);
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasForbiddenFinalGeometry(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasForbiddenFinalGeometry(value[index], `${path}/${index}`);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (["canvas", "coordinates", "finalcanvas", "finalcoordinates", "finaluicoordinates", "pixelfingerprint"].includes(normalizedKey)) {
      return `${path}/${key}`;
    }
    const found = hasForbiddenFinalGeometry(child, `${path}/${key}`);
    if (found) return found;
  }
  return null;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeValue(child)]));
  return value;
}

/** NFC-only normalization. It does not trim, rewrite, shorten, select CTA labels, or make layout decisions. */
export function normalizePlatformComposedSource(spec: PlatformComposedSourceSpec): PlatformComposedSourceSpec {
  return normalizeValue(spec) as PlatformComposedSourceSpec;
}

function validateField(value: unknown, rule: PlatformSourceFieldRule, path: string): PlatformSourceValidationIssue[] {
  const issues: PlatformSourceValidationIssue[] = [];
  if (rule.required === true && valueIsMissing(value)) {
    issues.push(issue("KBR-NAVER-SOURCE-FIELD-REQUIRED", "ERROR", "naver_source.field_required", path, value, true));
    return issues;
  }
  if (valueIsMissing(value)) return issues;
  if ((rule.type === "STRING" || rule.type === "URI" || rule.countingUnit === "CHARACTER") && typeof value !== "string") {
    issues.push(issue("KBR-NAVER-SOURCE-FIELD-TYPE", "ERROR", "naver_source.field_type", path, typeof value, "string"));
    return issues;
  }
  if (rule.type === "BOOLEAN" && typeof value !== "boolean") {
    issues.push(issue("KBR-NAVER-SOURCE-FIELD-TYPE", "ERROR", "naver_source.field_type", path, typeof value, "boolean"));
    return issues;
  }
  if (typeof value === "string" && rule.countingUnit === "CHARACTER") {
    const length = characterLength(value);
    if (rule.minLength !== null && rule.minLength !== undefined && length < rule.minLength) issues.push(issue("KBR-NAVER-SOURCE-FIELD-LENGTH", "ERROR", "naver_source.field_length", path, length, { minimum: rule.minLength, maximum: rule.maxLength }));
    if (rule.maxLength !== null && rule.maxLength !== undefined && length > rule.maxLength) issues.push(issue("KBR-NAVER-SOURCE-FIELD-LENGTH", "ERROR", "naver_source.field_length", path, length, { minimum: rule.minLength, maximum: rule.maxLength }));
  }
  if (rule.allowedValues && !rule.allowedValues.some((allowed) => Object.is(allowed, value))) {
    issues.push(issue("KBR-NAVER-SOURCE-FIELD-ENUM", "ERROR", "naver_source.field_enum", path, value, rule.allowedValues));
  }
  return issues;
}

function validateCollectionItems(
  spec: PlatformComposedSourceSpec,
  profile: PlatformComposedProfile,
): PlatformSourceValidationIssue[] {
  const issues: PlatformSourceValidationIssue[] = [];
  const collection = spec.collection;
  if (!collection || !Array.isArray(collection.items)) {
    issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEMS-REQUIRED", "ERROR", "naver_source.collection_items_required", "/collection/items"));
    return issues;
  }
  const itemCount = collection.items.length;
  if (profile.collection?.minimumItems !== undefined && itemCount < profile.collection.minimumItems) {
    issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-TOO-FEW-ITEMS", "ERROR", "naver_source.collection_too_few_items", "/collection/items", itemCount, profile.collection.minimumItems));
  }
  if (profile.collection?.maximumItems !== undefined && itemCount > profile.collection.maximumItems) {
    issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-TOO-MANY-ITEMS", "ERROR", "naver_source.collection_too_many_items", "/collection/items", itemCount, profile.collection.maximumItems));
  }
  if (isPlainObject(spec.metadata) && spec.metadata.itemCount !== undefined && spec.metadata.itemCount !== itemCount) {
    issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_count_mismatch", "/metadata/itemCount", spec.metadata.itemCount, itemCount));
  }

  const ids = new Map<string, number>();
  const allowedSourceProfiles = profile.collection?.itemSourceProfileIds ?? [];
  const itemFields = profile.collection?.itemFields ?? [];
  const assetIds = new Set(spec.assets.map((asset) => asset.assetId));
  collection.items.forEach((item, index) => {
    const itemPath = `/collection/items/${index}`;
    if (!isPlainObject(item)) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_invalid", itemPath));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(item, "collection") || (isPlainObject(item.metadata) && Object.prototype.hasOwnProperty.call(item.metadata, "collection"))) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-NESTED-NOT-SUPPORTED", "ERROR", "naver_source.collection_nested_not_supported", `${itemPath}/collection`));
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_id_required", `${itemPath}/id`));
    } else if (ids.has(item.id)) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-DUPLICATE-ITEM-ID", "ERROR", "naver_source.collection_duplicate_item_id", `${itemPath}/id`, item.id, ids.get(item.id)));
    } else {
      ids.set(item.id, index);
    }
    if (typeof item.sourceProfileId !== "string" || item.sourceProfileId.length === 0) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_source_profile_required", `${itemPath}/sourceProfileId`));
    } else if (allowedSourceProfiles.length > 0 && !allowedSourceProfiles.includes(item.sourceProfileId)) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-SOURCE-PROFILE-NOT-ALLOWED", "ERROR", "naver_source.collection_source_profile_not_allowed", `${itemPath}/sourceProfileId`, item.sourceProfileId, allowedSourceProfiles));
    }
    if (typeof item.assetId !== "string" || item.assetId.length === 0) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_asset_required", `${itemPath}/assetId`));
    } else if (!assetIds.has(item.assetId)) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_asset_missing", `${itemPath}/assetId`, item.assetId));
    }
    if (!isPlainObject(item.fields)) {
      issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "ERROR", "naver_source.collection_item_fields_required", `${itemPath}/fields`));
    } else if (itemFields.length > 0) {
      const itemFieldValues = item.fields as Record<string, unknown>;
      const knownFields = new Set(itemFields.flatMap((field) => [field.id, ...(field.aliases ?? [])]));
      for (const [fieldId, value] of Object.entries(itemFieldValues)) {
        if (!knownFields.has(fieldId)) issues.push(issue("KBR-NAVER-SOURCE-FIELD-UNKNOWN", "ERROR", "naver_source.collection_item_field_unknown", `${itemPath}/fields/${fieldId}`, value));
      }
      for (const rule of itemFields) {
        const valueKey = [rule.id, ...(rule.aliases ?? [])].find((key) => itemFieldValues[key] !== undefined) ?? rule.id;
        issues.push(...validateField(itemFieldValues[valueKey], rule, `${itemPath}/fields/${valueKey}`));
      }
    }
  });
  return issues;
}

function aspectRatioMatches(width: number, height: number, expected: string): boolean {
  if (!expected || expected.includes("|")) return expected.split("|").some((entry) => aspectRatioMatches(width, height, entry));
  const [expectedWidth = Number.NaN, expectedHeight = Number.NaN] = expected.split(":").map(Number);
  if (!Number.isFinite(expectedWidth) || !Number.isFinite(expectedHeight) || expectedHeight === 0) return true;
  return Math.abs(width / height - expectedWidth / expectedHeight) < 1e-6;
}

function validateAsset(asset: PlatformSourceAsset, rule: PlatformSourceAssetRule, path: string): PlatformSourceValidationIssue[] {
  const issues: PlatformSourceValidationIssue[] = [];
  if (rule.canvas?.width !== undefined && asset.width !== rule.canvas.width || rule.canvas?.height !== undefined && asset.height !== rule.canvas.height) {
    issues.push(issue("KBR-NAVER-SOURCE-ASSET-DIMENSION", "ERROR", "naver_source.asset_dimension", path, { width: asset.width, height: asset.height }, rule.canvas));
  }
  if (rule.canvas?.minimumWidth !== undefined && asset.width < rule.canvas.minimumWidth) issues.push(issue("KBR-NAVER-SOURCE-ASSET-DIMENSION", "ERROR", "naver_source.asset_dimension", path, asset.width, { minimumWidth: rule.canvas.minimumWidth }));
  const ratios = rule.canvas?.aspectRatios ?? [];
  if (ratios.length > 0 && !ratios.some((ratio) => aspectRatioMatches(asset.width, asset.height, ratio))) issues.push(issue("KBR-NAVER-SOURCE-ASSET-ASPECT-RATIO", "ERROR", "naver_source.asset_aspect_ratio", path, `${asset.width}:${asset.height}`, ratios));
  const exactCanvasDeclared = rule.canvas?.width !== undefined && rule.canvas?.height !== undefined;
  if (!exactCanvasDeclared && rule.aspectRatio && !["SAME_AS_VIDEO", "1.5:1"].includes(rule.aspectRatio) && !aspectRatioMatches(asset.width, asset.height, rule.aspectRatio)) issues.push(issue("KBR-NAVER-SOURCE-ASSET-ASPECT-RATIO", "ERROR", "naver_source.asset_aspect_ratio", path, `${asset.width}:${asset.height}`, rule.aspectRatio));
  if (rule.mime && !rule.mime.includes(asset.mime)) issues.push(issue("KBR-NAVER-SOURCE-ASSET-MIME", "ERROR", "naver_source.asset_mime", path, asset.mime, rule.mime));
  if (rule.fileSize?.minimumBytes !== undefined && asset.bytes < rule.fileSize.minimumBytes || rule.fileSize?.maximumBytes !== undefined && asset.bytes > rule.fileSize.maximumBytes) issues.push(issue("KBR-NAVER-SOURCE-ASSET-FILESIZE", "ERROR", "naver_source.asset_filesize", path, asset.bytes, rule.fileSize));
  if (typeof rule.alpha?.allowed === "boolean" && asset.hasAlpha !== undefined && asset.hasAlpha !== rule.alpha.allowed) issues.push(issue("KBR-NAVER-SOURCE-ASSET-ALPHA", "ERROR", "naver_source.asset_alpha", path, asset.hasAlpha, rule.alpha.allowed));
  if (rule.safeArea) {
    const actual = asset.safeArea;
    const matches = actual !== undefined && actual.x === rule.safeArea.x && actual.y === rule.safeArea.y && actual.width === rule.safeArea.width && actual.height === rule.safeArea.height;
    if (!matches) issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-ASSET-SAFE-AREA", "ERROR", "naver_source.collection_asset_safe_area", path, actual, rule.safeArea));
  }
  return issues;
}

/** Validates source payload constraints only; it never renders, crops, truncates, or computes a final pixel fingerprint. */
export function validatePlatformComposedSource(spec: PlatformComposedSourceSpec, profile: PlatformComposedProfile): PlatformSourceValidationResult {
  const issues: PlatformSourceValidationIssue[] = [];
  const forbiddenPath = hasForbiddenFinalGeometry(spec);
  if (forbiddenPath) issues.push(issue("KBR-NAVER-SOURCE-FINAL-GEOMETRY-FORBIDDEN", "ERROR", "naver_source.final_geometry_forbidden", forbiddenPath));
  if (spec.schemaVersion !== NAVER_PLATFORM_SOURCE_SCHEMA_VERSION && spec.schemaVersion !== NAVER_PLATFORM_SOURCE_PREVIOUS_SCHEMA_VERSION) issues.push(issue("KBR-NAVER-SOURCE-SCHEMA-VERSION", "ERROR", "naver_source.schema_version", "/schemaVersion", spec.schemaVersion, [NAVER_PLATFORM_SOURCE_PREVIOUS_SCHEMA_VERSION, NAVER_PLATFORM_SOURCE_SCHEMA_VERSION]));
  if (spec.channel !== "NAVER_GFA") issues.push(issue("KBR-NAVER-SOURCE-CHANNEL", "ERROR", "naver_source.channel", "/channel", spec.channel, "NAVER_GFA"));
  if (spec.compositionMode !== "PLATFORM_COMPOSED") issues.push(issue("KBR-NAVER-SOURCE-COMPOSITION", "ERROR", "naver_source.composition_mode", "/compositionMode", spec.compositionMode, "PLATFORM_COMPOSED"));
  if (spec.placement !== profile.placement) issues.push(issue("KBR-NAVER-SOURCE-PLACEMENT", "ERROR", "naver_source.placement", "/placement", spec.placement, profile.placement));
  if (spec.sourceProfileId !== profile.id) issues.push(issue("KBR-NAVER-SOURCE-PROFILE", "ERROR", "naver_source.profile", "/sourceProfileId", spec.sourceProfileId, profile.id));
  if (spec.artifactCardinality !== profile.artifactCardinality) issues.push(issue("KBR-NAVER-SOURCE-CARDINALITY", "ERROR", "naver_source.cardinality", "/artifactCardinality", spec.artifactCardinality, profile.artifactCardinality));
  if (spec.artifactCardinality === "SINGLE" && spec.collection !== undefined) {
    issues.push(issue("KBR-NAVER-SOURCE-COLLECTION-NESTED-NOT-SUPPORTED", "ERROR", "naver_source.collection_not_allowed_for_single", "/collection"));
  }

  const knownFields = new Set(profile.fields.flatMap((field) => [field.id, ...(field.aliases ?? [])]));
  for (const [fieldId, value] of Object.entries(spec.fields ?? {})) {
    if (!knownFields.has(fieldId)) issues.push(issue("KBR-NAVER-SOURCE-FIELD-UNKNOWN", "ERROR", "naver_source.field_unknown", `/fields/${fieldId}`, value));
  }
  for (const rule of profile.fields) {
    const valueKey = [rule.id, ...(rule.aliases ?? [])].find((key) => spec.fields?.[key] !== undefined) ?? rule.id;
    issues.push(...validateField(spec.fields?.[valueKey], rule, `/fields/${valueKey}`));
  }

  const rulesByRole = new Map<string, PlatformSourceAssetRule[]>();
  for (const rule of profile.assets) rulesByRole.set(rule.assetRole, [...(rulesByRole.get(rule.assetRole) ?? []), rule]);
  for (const [role, rules] of rulesByRole) {
    const assets = spec.assets.filter((asset) => asset.assetRole === role);
    const required = rules.some((rule) => rule.required === true);
    if (required && assets.length === 0) issues.push(issue("KBR-NAVER-SOURCE-ASSET-REQUIRED", "ERROR", "naver_source.asset_required", "/assets", undefined, role));
    for (const asset of assets) {
      const matchingRule = rules.find((rule) => rule.id !== undefined && rule.id === asset.sourceProfileId)
        ?? rules.find((rule) => rule.id === undefined && rule.assetRole === asset.assetRole)
        ?? (rules.length === 1 ? rules[0] : undefined);
      if (!matchingRule) issues.push(issue("KBR-NAVER-SOURCE-ASSET-PROFILE", "ERROR", "naver_source.asset_profile", `/assets/${asset.assetId}`, asset.sourceProfileId, rules.map((rule) => rule.id)));
      else issues.push(...validateAsset(asset, matchingRule, `/assets/${asset.assetId}`));
    }
  }
  for (const asset of spec.assets) {
    if (!rulesByRole.has(asset.assetRole)) issues.push(issue("KBR-NAVER-SOURCE-ASSET-UNKNOWN", "ERROR", "naver_source.asset_unknown", `/assets/${asset.assetId}`, asset.assetRole));
  }
  if (profile.artifactCardinality === "COLLECTION") issues.push(...validateCollectionItems(spec, profile));
  if (profile.runtimeStatus && !profile.runtimeStatus.startsWith("IMPLEMENTED")) issues.push(issue("KBR-NAVER-SOURCE-RUNTIME-DEFERRED", "WARNING", "naver_source.runtime_deferred", "/sourceProfileId", profile.runtimeStatus));

  const sorted = sortIssues(issues);
  const errors = sorted.filter((entry) => entry.severity === "ERROR");
  const warnings = sorted.filter((entry) => entry.severity === "WARNING");
  const info = sorted.filter((entry) => entry.severity === "INFO");
  return {
    status: errors.length > 0 ? "ERROR" : warnings.length > 0 ? "WARNING" : "PASS",
    errors,
    warnings,
    info,
    normalized: errors.length > 0 ? null : normalizePlatformComposedSource(spec),
    finalUiRendered: false,
    pixelFingerprint: null,
  };
}

export function platformComposedSourceHasFinalPixelOutput(result: PlatformSourceValidationResult): false {
  return result.finalUiRendered;
}

/** Materializes the frozen JSON registry into the generic validator profile shape. */
export function materializePlatformComposedProfile(
  registry: Readonly<Record<string, unknown>>,
  profileId: string,
): PlatformComposedProfile | null {
  const profiles = Array.isArray(registry.profiles) ? registry.profiles : [];
  const raw = profiles.find((entry) => isPlainObject(entry) && entry.id === profileId);
  if (!isPlainObject(raw)) return null;
  const fieldCatalog = isPlainObject(registry.fieldCatalog) ? registry.fieldCatalog : {};
  const assetCatalog = isPlainObject(registry.assetCatalog) ? registry.assetCatalog : {};
  const fieldRule = (fieldRef: unknown): PlatformSourceFieldRule | null => {
    const rawFieldValue = fieldCatalog[String(fieldRef)];
    const rawField = isPlainObject(rawFieldValue) ? rawFieldValue : null;
    if (!rawField || typeof rawField.id !== "string") return null;
    return {
      id: rawField.id,
      ...(typeof fieldRef === "string" && fieldRef !== rawField.id ? { aliases: [fieldRef] } : {}),
      ...(typeof rawField.type === "string" ? { type: rawField.type } : {}),
      ...(typeof rawField.required === "boolean" || rawField.required === "UNRESOLVED" ? { required: rawField.required } : {}),
      ...(typeof rawField.minLength === "number" || rawField.minLength === null ? { minLength: rawField.minLength } : {}),
      ...(typeof rawField.maxLength === "number" || rawField.maxLength === null ? { maxLength: rawField.maxLength } : {}),
      ...(typeof rawField.maxLines === "number" || rawField.maxLines === null ? { maxLines: rawField.maxLines } : {}),
      ...(typeof rawField.maxCharactersPerLine === "number" || rawField.maxCharactersPerLine === null ? { maxCharactersPerLine: rawField.maxCharactersPerLine } : {}),
      ...(typeof rawField.countingUnit === "string" ? { countingUnit: rawField.countingUnit as PlatformSourceCountingUnit } : {}),
      ...(Array.isArray(rawField.allowedValues) ? { allowedValues: rawField.allowedValues } : {}),
      ...(typeof rawField.conditional === "string" || rawField.conditional === null ? { conditional: rawField.conditional } : {}),
    };
  };
  const assetRule = (assetRef: unknown): PlatformSourceAssetRule | null => {
    const rawAssetValue = assetCatalog[String(assetRef)];
    const rawAsset = isPlainObject(rawAssetValue) ? rawAssetValue : null;
    if (!rawAsset || typeof rawAsset.assetRole !== "string") return null;
    const canvas = isPlainObject(rawAsset.canvas) ? rawAsset.canvas : null;
    const fileSize = isPlainObject(rawAsset.fileSize) ? rawAsset.fileSize : null;
    const alpha = isPlainObject(rawAsset.alpha) ? rawAsset.alpha : null;
    const safeArea = isPlainObject(rawAsset.safeArea) && typeof rawAsset.safeArea.x === "number" && typeof rawAsset.safeArea.y === "number" && typeof rawAsset.safeArea.width === "number" && typeof rawAsset.safeArea.height === "number"
      ? { x: rawAsset.safeArea.x, y: rawAsset.safeArea.y, width: rawAsset.safeArea.width, height: rawAsset.safeArea.height }
      : undefined;
    return {
      ...(typeof assetRef === "string" ? { id: assetRef } : {}),
      assetRole: rawAsset.assetRole,
      ...(typeof rawAsset.required === "boolean" || rawAsset.required === "UNRESOLVED" ? { required: rawAsset.required } : {}),
      ...(canvas ? { canvas: {
        ...(typeof canvas.width === "number" ? { width: canvas.width } : {}),
        ...(typeof canvas.height === "number" ? { height: canvas.height } : {}),
        ...(typeof canvas.minimumWidth === "number" ? { minimumWidth: canvas.minimumWidth } : {}),
        ...(Array.isArray(canvas.aspectRatios) ? { aspectRatios: canvas.aspectRatios.filter((value): value is string => typeof value === "string") } : {}),
      } } : {}),
      ...(typeof rawAsset.aspectRatio === "string" ? { aspectRatio: rawAsset.aspectRatio } : {}),
      ...(Array.isArray(rawAsset.mime) ? { mime: rawAsset.mime.filter((value): value is string => typeof value === "string") } : {}),
      ...(fileSize ? { fileSize: {
        ...(typeof fileSize.minimumBytes === "number" ? { minimumBytes: fileSize.minimumBytes } : {}),
        ...(typeof fileSize.maximumBytes === "number" ? { maximumBytes: fileSize.maximumBytes } : {}),
      } } : {}),
      ...(alpha && (typeof alpha.allowed === "boolean" || alpha.allowed === "UNRESOLVED") ? { alpha: { allowed: alpha.allowed } } : {}),
      ...(safeArea ? { safeArea } : {}),
    };
  };
  const fieldRefs = Array.isArray(raw.fields) ? raw.fields : [];
  const assetRefs = Array.isArray(raw.assets) ? raw.assets : [];
  const fields = fieldRefs.map(fieldRule).filter((entry): entry is PlatformSourceFieldRule => entry !== null);
  const assets = assetRefs.map(assetRule).filter((entry): entry is PlatformSourceAssetRule => entry !== null);
  const rawCollection = isPlainObject(raw.collection) ? raw.collection : null;
  const itemFieldRefs = rawCollection && Array.isArray(rawCollection.itemFields) ? rawCollection.itemFields : [];
  const itemFields = itemFieldRefs.map(fieldRule).filter((entry): entry is PlatformSourceFieldRule => entry !== null);
  const itemSourceProfileIds = rawCollection && Array.isArray(rawCollection.itemSourceProfileIds)
    ? rawCollection.itemSourceProfileIds.filter((value): value is string => typeof value === "string")
    : assets.filter((entry) => entry.assetRole.startsWith("collectionItem")).map((entry) => entry.id).filter((value): value is string => value !== undefined);
  return {
    id: typeof raw.id === "string" ? raw.id : profileId,
    placement: raw.placement as NaverGfaPlacement,
    artifactCardinality: raw.artifactCardinality as ArtifactCardinality,
    fields,
    assets,
    ...(rawCollection ? { collection: {
      ...(typeof rawCollection.minimumItems === "number" ? { minimumItems: rawCollection.minimumItems } : {}),
      ...(typeof rawCollection.maximumItems === "number" ? { maximumItems: rawCollection.maximumItems } : {}),
      ...(rawCollection.ordering === "INPUT_ORDER_PRESERVED" ? { ordering: rawCollection.ordering } : {}),
      ...(itemFields.length > 0 ? { itemFields } : {}),
      ...(itemSourceProfileIds.length > 0 ? { itemSourceProfileIds } : {}),
    } } : {}),
    ...(typeof raw.runtimeStatus === "string" ? { runtimeStatus: raw.runtimeStatus } : {}),
  };
}
