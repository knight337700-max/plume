/**
 * Google Ads static asset contracts.  These types intentionally live beside
 * the renderer contract package but are not merged into the legacy Kakao,
 * NAVER, or META format-profile registry.
 */

export const GOOGLE_STATIC_CONTRACT_VERSION = "1.0.0" as const;
export const GOOGLE_STATIC_PROFILE_REGISTRY_VERSION = "1.0.0" as const;
export const GOOGLE_CREATIVE_ASSET_SET_MANIFEST_VERSION = "1.0.0" as const;
export const GOOGLE_STATIC_DEFAULT_PLACEMENT_REGISTRY_VERSION = "1.0.0" as const;

export type GoogleStaticLayoutMode = "FREEFORM";
export type GoogleStaticCompositionMode = "PLATFORM_COMPOSED" | "RENDERER_COMPOSED";
export type GoogleStaticArtifactCardinality = "SINGLE";
export type GoogleStaticDeliveryCardinality = "COLLECTION";
export type GoogleStaticTarget = "RDA" | "PMAX" | "DEMAND_GEN" | "DEMAND_GEN_UPLOADED_DISPLAY_STATIC";
export type GoogleStaticAssetRole =
  | "MARKETING_IMAGE"
  | "SQUARE_MARKETING_IMAGE"
  | "PORTRAIT_MARKETING_IMAGE"
  | "TALL_PORTRAIT_MARKETING_IMAGE"
  | "LOGO"
  | "LANDSCAPE_LOGO"
  | "UPLOADED_DISPLAY_STATIC";
export type GoogleDeliveryRole =
  | "LANDSCAPE_MARKETING_IMAGE"
  | "MARKETING_IMAGE"
  | "HORIZONTAL_IMAGE"
  | "SQUARE_MARKETING_IMAGE"
  | "SQUARE_IMAGE"
  | "PORTRAIT_MARKETING_IMAGE"
  | "PORTRAIT_IMAGE"
  | "VERTICAL_MARKETING_IMAGE"
  | "TALL_PORTRAIT_IMAGE"
  | "TALL_PORTRAIT_MARKETING_IMAGE"
  | "SQUARE_LOGO"
  | "LANDSCAPE_LOGO"
  | "LOGO"
  | "UPLOADED_DISPLAY_STATIC"
  | "HEADLINE"
  | "LONG_HEADLINE"
  | "DESCRIPTION"
  | "BUSINESS_NAME"
  | "SHORT_HEADLINE"
  | "CTA"
  | "FINAL_URL"
  | "CALL_TO_ACTION_SELECTION";
export type GoogleStaticMime = "image/png" | "image/jpeg";
export type GoogleStaticPlacementPolicy = "NONE" | "CENTER_CONTAIN" | "MANUAL_CROP" | "SEMANTIC_CROP_COVER" | "ALPHA_TRIM_CONTAIN";
export type GoogleStaticSeverity = "ERROR" | "WARNING" | "INFO";

export type GooglePixelSize = Readonly<{ width: number; height: number }>;
export type GoogleStaticPixelRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type GoogleStaticRgbaColor = Readonly<{ r: number; g: number; b: number; alpha: number }>;

export type GoogleStaticAssetProfile = Readonly<{
  profileId: string;
  role: GoogleStaticAssetRole;
  compositionMode: GoogleStaticCompositionMode;
  layoutMode: GoogleStaticLayoutMode;
  artifactCardinality: GoogleStaticArtifactCardinality;
  deliveryCardinality: GoogleStaticDeliveryCardinality;
  officialRatio?: GooglePixelSize;
  officialMinimumPixels?: GooglePixelSize;
  officialRecommendedPixels?: GooglePixelSize;
  projectOutputPreset: GooglePixelSize;
  targetIds: readonly GoogleStaticTarget[];
  maxBytesByTarget: Readonly<Record<string, number>>;
  allowedPlacementPolicies: readonly GoogleStaticPlacementPolicy[];
  defaultPlacementPolicy: GoogleStaticPlacementPolicy;
  sourceRuleIds: readonly string[];
  sourceStatus?: string;
  sourceDiscrepancy?: string;
  safeZoneStatus?: string;
  g1Required?: boolean;
}>;

export type GoogleStaticProfileRegistry = Readonly<{
  schemaVersion: string;
  registryVersion: string;
  phase: string;
  status: string;
  googleArchitectureVersion: string;
  layoutMode: GoogleStaticLayoutMode;
  artifactCardinality: GoogleStaticArtifactCardinality;
  deliveryCardinality: GoogleStaticDeliveryCardinality;
  rendererOutputMime: readonly GoogleStaticMime[];
  platformTextRasterization: false;
  geometryProfiles: readonly GoogleStaticAssetProfile[];
  uploadedDisplayStaticProfiles: readonly GoogleStaticAssetProfile[];
  legacyDisplayRuntimeProfiles: readonly GoogleStaticAssetProfile[];
  profileCount: number;
  geometryProfileCount: number;
  uploadedDisplayStaticProfileCount: number;
  placementPolicyDefaults?: unknown;
  mimePolicy?: unknown;
  sizePolicy?: unknown;
}>;

export type GoogleCapabilityRoleRule = Readonly<{
  role: string;
  required: boolean;
  min: number;
  max: number;
  profileIds: readonly string[];
  diagnostic?: string;
}>;

export type GoogleCapabilityMapping = Readonly<{
  capabilityId: string;
  compositionMode: GoogleStaticCompositionMode;
  layoutMode: GoogleStaticLayoutMode;
  artifactCardinality: GoogleStaticArtifactCardinality;
  deliveryCardinality: GoogleStaticDeliveryCardinality;
  runtimeStatus: string;
  roles: readonly GoogleCapabilityRoleRule[];
}>;

export type GoogleCapabilityRoleMappingRegistry = Readonly<{
  schemaVersion: string;
  status: string;
  googleArchitectureVersion: string;
  compositionBoundary: Readonly<Record<string, unknown>>;
  capabilities: readonly GoogleCapabilityMapping[];
  capabilityCount: number;
}>;

export type GoogleByteConstraint = Readonly<{
  targetId: GoogleStaticTarget;
  roles: readonly GoogleStaticAssetRole[];
  maxBytes: number;
}>;

export type GoogleTargetConstraintRegistry = Readonly<{
  schemaVersion: string;
  status: string;
  byteUnit: "decimal-byte";
  mime: readonly GoogleStaticMime[];
  constraints: readonly GoogleByteConstraint[];
}>;

export type GoogleDiagnosticDefinition = Readonly<{
  code: string;
  severity: GoogleStaticSeverity;
  layer: "artifact" | "deliverySet" | "platformIntegration";
  blocking: boolean;
  messageKey: string;
}>;

export type GoogleDiagnosticRegistry = Readonly<{
  schemaVersion: string;
  status: string;
  frozenSource: string;
  codes: readonly GoogleDiagnosticDefinition[];
  count: number;
}>;

export type GoogleStaticDefaultPlacementEntry = Readonly<{
  profileId: string;
  role: GoogleStaticAssetRole;
  sourceDimensions: GooglePixelSize;
  placementPolicy: GoogleStaticPlacementPolicy;
  sourceRect?: GoogleStaticPixelRect;
  destinationRect: GoogleStaticPixelRect;
  background: GoogleStaticRgbaColor;
  semanticPlan?: true;
  explicitElementPlan?: true;
  outputFormat: "PNG" | "JPEG";
  jpegQuality?: number;
  sourceFixtureRelativePath: string;
  sourceFixtureSha256: string;
  layoutPlanRelativePath: string;
  layoutPlanSha256: string;
  frozenArtifactRelativePath: string;
  frozenArtifactSha256: string;
  frozenRenderFingerprint: string;
}>;

export type GoogleStaticDefaultPlacementRegistry = Readonly<{
  schemaVersion: string;
  registryVersion: typeof GOOGLE_STATIC_DEFAULT_PLACEMENT_REGISTRY_VERSION;
  phase: string;
  status: string;
  sourceRegistry: Readonly<{
    goldenRegistry: string;
    goldenRegistrySha256: string;
    sourceOfTruth: string;
  }>;
  geometryProfileCount: 7;
  uploadedDisplayStaticProfileCount: 7;
  entries: readonly GoogleStaticDefaultPlacementEntry[];
}>;

export type GoogleAssetArtifact = Readonly<{
  artifactId: string;
  assetProfileId: string;
  role: string;
  ordinal: number;
  width?: number;
  height?: number;
  mime?: string;
  mimeType?: string;
  bytes?: number;
  hasAlpha?: boolean;
  animation?: boolean;
  placementPolicy?: GoogleStaticPlacementPolicy;
  placementPlan?: Readonly<Record<string, unknown>>;
}>;

export type CreativeAssetSetManifest = Readonly<{
  schemaVersion: typeof GOOGLE_CREATIVE_ASSET_SET_MANIFEST_VERSION;
  capabilityId: string;
  lifecycleSnapshot: string;
  brandGuidelinesEnabled?: boolean;
  assets: readonly GoogleAssetArtifact[];
  platformFields?: Readonly<Record<string, unknown>>;
}>;

export type GoogleValidationIssue = Readonly<{
  code: string;
  severity: GoogleStaticSeverity;
  messageKey: string;
  path: string;
  actual?: unknown;
  expected?: unknown;
  profileId?: string;
  artifactId?: string;
  role?: string;
}>;

export type GoogleValidationResult = Readonly<{
  status: "PASS" | "ERROR";
  errors: readonly GoogleValidationIssue[];
  warnings: readonly GoogleValidationIssue[];
  info: readonly GoogleValidationIssue[];
}>;

export type GoogleStaticContracts = Readonly<{
  profiles: GoogleStaticProfileRegistry;
  mapping: GoogleCapabilityRoleMappingRegistry;
  constraints: GoogleTargetConstraintRegistry;
  diagnostics: GoogleDiagnosticRegistry;
  defaultPlacementPlans: GoogleStaticDefaultPlacementRegistry;
}>;

export function isGoogleStaticAssetRole(value: unknown): value is GoogleStaticAssetRole {
  return typeof value === "string" && [
    "MARKETING_IMAGE",
    "SQUARE_MARKETING_IMAGE",
    "PORTRAIT_MARKETING_IMAGE",
    "TALL_PORTRAIT_MARKETING_IMAGE",
    "LOGO",
    "LANDSCAPE_LOGO",
    "UPLOADED_DISPLAY_STATIC",
  ].includes(value);
}

export function isGoogleStaticMime(value: unknown): value is GoogleStaticMime {
  return value === "image/png" || value === "image/jpeg";
}

export function sortGoogleValidationIssues(issues: readonly GoogleValidationIssue[]): GoogleValidationIssue[] {
  const severityOrder: Record<GoogleStaticSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return [...issues].sort((left, right) =>
    (severityOrder[left.severity] - severityOrder[right.severity])
      || left.path.localeCompare(right.path)
      || left.code.localeCompare(right.code)
      || left.messageKey.localeCompare(right.messageKey));
}

export function splitGoogleValidationIssues(issues: readonly GoogleValidationIssue[]): GoogleValidationResult {
  const sorted = sortGoogleValidationIssues(issues);
  return {
    status: sorted.some((issue) => issue.severity === "ERROR") ? "ERROR" : "PASS",
    errors: sorted.filter((issue) => issue.severity === "ERROR"),
    warnings: sorted.filter((issue) => issue.severity === "WARNING"),
    info: sorted.filter((issue) => issue.severity === "INFO"),
  };
}
