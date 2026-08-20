import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CreativeAssetSetManifest,
  GoogleAssetArtifact,
  GoogleCapabilityMapping,
  GoogleCapabilityRoleMappingRegistry,
  GoogleDiagnosticRegistry,
  GoogleStaticAssetProfile,
  GoogleStaticContracts,
  GoogleStaticDefaultPlacementRegistry,
  GoogleStaticMime,
  GoogleStaticProfileRegistry,
  GoogleStaticTarget,
  GoogleTargetConstraintRegistry,
  GoogleValidationIssue,
  GoogleValidationResult,
} from "@kbr/renderer-contract";
import { isGoogleStaticMime, splitGoogleValidationIssues } from "@kbr/renderer-contract";

const UNKNOWN_PROFILE = "KBR-GOOGLE-ASSET-PROFILE-UNKNOWN";
const CANVAS_MISMATCH = "KBR-GOOGLE-ASSET-CANVAS-MISMATCH";
const MIME_UNSUPPORTED = "KBR-GOOGLE-ASSET-MIME-UNSUPPORTED";
const BYTES_EXCEEDED = "KBR-GOOGLE-ASSET-BYTES-EXCEEDED";
const REQUIRED_ROLE_MISSING = "KBR-GOOGLE-SET-REQUIRED-ROLE-MISSING";
const ROLE_CARDINALITY_EXCEEDED = "KBR-GOOGLE-SET-ROLE-CARDINALITY-EXCEEDED";
const TEXT_LIMIT_EXCEEDED = "KBR-GOOGLE-TEXT-LIMIT-EXCEEDED";
const PMAX_MODE_MISMATCH = "KBR-GOOGLE-PMAX-BRAND-ASSOCIATION-MODE-MISMATCH";
const RDA_VERTICAL_INFO = "KBR-GOOGLE-RDA-VERTICAL-SOURCE-DISCREPANCY";
const DG_SAFE_ZONE_INFO = "KBR-GOOGLE-DEMANDGEN-SAFE-ZONE-SOURCE-REQUIRED";
const LIFECYCLE_INFO = "KBR-GOOGLE-LIFECYCLE-TRANSITIONAL";

type G1Json = GoogleStaticProfileRegistry | GoogleCapabilityRoleMappingRegistry | GoogleTargetConstraintRegistry | GoogleDiagnosticRegistry | GoogleStaticDefaultPlacementRegistry;

async function readJson<T extends G1Json>(projectRoot: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(projectRoot, ...relativePath.split("/")), "utf8")) as T;
}

export async function loadGoogleStaticContracts(projectRoot: string): Promise<GoogleStaticContracts> {
  const [profiles, mapping, constraints, diagnostics, defaultPlacementPlans] = await Promise.all([
    readJson<GoogleStaticProfileRegistry>(projectRoot, "contracts/google/static-asset-profiles.g1.json"),
    readJson<GoogleCapabilityRoleMappingRegistry>(projectRoot, "contracts/google/capability-asset-role-mapping.g1.json"),
    readJson<GoogleTargetConstraintRegistry>(projectRoot, "contracts/google/target-constraints.g1.json"),
    readJson<GoogleDiagnosticRegistry>(projectRoot, "contracts/google/diagnostics.g1.json"),
    readJson<GoogleStaticDefaultPlacementRegistry>(projectRoot, "contracts/google/default-placement-plans.g3.0.4.json"),
  ]);
  return { profiles, mapping, constraints, diagnostics, defaultPlacementPlans };
}

export function listGoogleStaticProfiles(contracts: GoogleStaticContracts): GoogleStaticAssetProfile[] {
  return [...contracts.profiles.geometryProfiles, ...contracts.profiles.uploadedDisplayStaticProfiles];
}

export function resolveGoogleStaticProfile(profileId: string, contracts: GoogleStaticContracts): GoogleStaticAssetProfile | undefined {
  return listGoogleStaticProfiles(contracts).find((profile) => profile.profileId === profileId);
}

export function resolveGoogleCapability(capabilityId: string, contracts: GoogleStaticContracts): GoogleCapabilityMapping | undefined {
  return contracts.mapping.capabilities.find((capability) => capability.capabilityId === capabilityId);
}

export function resolveGoogleTargetConstraint(targetId: GoogleStaticTarget, role: string, contracts: GoogleStaticContracts): number | undefined {
  return contracts.constraints.constraints.find((constraint) => constraint.targetId === targetId && constraint.roles.includes(role as never))?.maxBytes;
}

function makeIssue(
  code: string,
  severity: GoogleValidationIssue["severity"],
  messageKey: string,
  pathValue: string,
  details: { actual?: unknown; expected?: unknown; profileId?: string; artifactId?: string; role?: string } = {},
): GoogleValidationIssue {
  return {
    code,
    severity,
    messageKey,
    path: pathValue,
    ...(details.actual === undefined ? {} : { actual: details.actual }),
    ...(details.expected === undefined ? {} : { expected: details.expected }),
    ...(details.profileId === undefined ? {} : { profileId: details.profileId }),
    ...(details.artifactId === undefined ? {} : { artifactId: details.artifactId }),
    ...(details.role === undefined ? {} : { role: details.role }),
  };
}

function targetForProfile(profile: GoogleStaticAssetProfile, target?: GoogleStaticTarget): GoogleStaticTarget | undefined {
  if (target && profile.targetIds.includes(target)) return target;
  return profile.targetIds.length === 1 ? profile.targetIds[0] : undefined;
}

function artifactMime(artifact: GoogleAssetArtifact): string | undefined {
  return artifact.mime ?? artifact.mimeType;
}

/** Validate one encoded artifact against its G1 profile and target byte cap. */
export function validateGoogleStaticArtifact(
  artifact: GoogleAssetArtifact,
  contracts: GoogleStaticContracts,
  options: { target?: GoogleStaticTarget; path?: string } = {},
): GoogleValidationIssue[] {
  const pathValue = options.path ?? `/assets/${artifact.ordinal}`;
  const profile = resolveGoogleStaticProfile(artifact.assetProfileId, contracts);
  if (!profile) {
    return [makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_profile_unknown", `${pathValue}/assetProfileId`, { actual: artifact.assetProfileId, expected: listGoogleStaticProfiles(contracts).map((entry) => entry.profileId), artifactId: artifact.artifactId })];
  }
  const issues: GoogleValidationIssue[] = [];
  const expectedCanvas = profile.projectOutputPreset;
  if (artifact.width !== undefined && artifact.height !== undefined && (artifact.width !== expectedCanvas.width || artifact.height !== expectedCanvas.height)) {
    issues.push(makeIssue(CANVAS_MISMATCH, "ERROR", "google.asset_canvas_mismatch", `${pathValue}/width`, { actual: { width: artifact.width, height: artifact.height }, expected: expectedCanvas, profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  if (artifact.width === undefined || artifact.height === undefined) {
    issues.push(makeIssue(CANVAS_MISMATCH, "ERROR", "google.asset_canvas_mismatch", pathValue, { actual: { width: artifact.width ?? null, height: artifact.height ?? null }, expected: expectedCanvas, profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  const mime = artifactMime(artifact);
  if (!isGoogleStaticMime(mime)) {
    issues.push(makeIssue(MIME_UNSUPPORTED, "ERROR", "google.asset_mime_unsupported", `${pathValue}/mime`, { actual: mime ?? null, expected: ["image/png", "image/jpeg"], profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  if (artifact.animation === true) {
    issues.push(makeIssue(MIME_UNSUPPORTED, "ERROR", "google.asset_mime_unsupported", `${pathValue}/animation`, { actual: true, expected: false, profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  const resolvedTarget = targetForProfile(profile, options.target);
  if (options.target && resolvedTarget === undefined) {
    issues.push(makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_profile_unknown", `${pathValue}/assetProfileId`, { actual: { profileId: profile.profileId, target: options.target }, expected: profile.targetIds, profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  if (artifact.bytes !== undefined && resolvedTarget !== undefined) {
    const maxBytes = profile.maxBytesByTarget[resolvedTarget] ?? resolveGoogleTargetConstraint(resolvedTarget, profile.role, contracts);
    if (maxBytes !== undefined && artifact.bytes > maxBytes) {
      issues.push(makeIssue(BYTES_EXCEEDED, "ERROR", "google.asset_bytes_exceeded", `${pathValue}/bytes`, { actual: artifact.bytes, expected: maxBytes, profileId: profile.profileId, artifactId: artifact.artifactId }));
    }
  }
  if (artifact.placementPolicy !== undefined && !profile.allowedPlacementPolicies.includes(artifact.placementPolicy)) {
    issues.push(makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_placement_policy_not_allowed", `${pathValue}/placementPolicy`, { actual: artifact.placementPolicy, expected: profile.allowedPlacementPolicies, profileId: profile.profileId, artifactId: artifact.artifactId }));
  }
  return issues;
}

function canonicalProfileRole(role: string): string {
  const aliases: Record<string, string> = {
    LANDSCAPE_MARKETING_IMAGE: "MARKETING_IMAGE",
    HORIZONTAL_IMAGE: "MARKETING_IMAGE",
    SQUARE_IMAGE: "SQUARE_MARKETING_IMAGE",
    PORTRAIT_IMAGE: "PORTRAIT_MARKETING_IMAGE",
    VERTICAL_MARKETING_IMAGE: "TALL_PORTRAIT_MARKETING_IMAGE",
    TALL_PORTRAIT_IMAGE: "TALL_PORTRAIT_MARKETING_IMAGE",
    SQUARE_LOGO: "LOGO",
  };
  return aliases[role] ?? role;
}

function assetRoleMatches(ruleRole: string, artifact: GoogleAssetArtifact, profile: GoogleStaticAssetProfile | undefined): boolean {
  if (!profile) return false;
  if (ruleRole === artifact.role) return true;
  return canonicalProfileRole(ruleRole) === profile.role || canonicalProfileRole(artifact.role) === canonicalProfileRole(ruleRole);
}

function roleAssets(manifest: CreativeAssetSetManifest, ruleRole: string, contracts: GoogleStaticContracts): GoogleAssetArtifact[] {
  return manifest.assets.filter((asset) => {
    const profile = resolveGoogleStaticProfile(asset.assetProfileId, contracts);
    return assetRoleMatches(ruleRole, asset, profile);
  });
}

function fieldValue(manifest: CreativeAssetSetManifest, field: string): unknown {
  return manifest.platformFields?.[field];
}

function values(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function validateTextField(manifest: CreativeAssetSetManifest, field: string, min: number, max: number, maxCharacters: number, issues: GoogleValidationIssue[]): void {
  const fieldValues = values(fieldValue(manifest, field));
  if (fieldValues.length < min) {
    issues.push(makeIssue(REQUIRED_ROLE_MISSING, "ERROR", "google.required_role_missing", `/platformFields/${field}`, { actual: fieldValues.length, expected: { min, max }, role: field }));
    return;
  }
  if (fieldValues.length > max) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", `/platformFields/${field}`, { actual: fieldValues.length, expected: { min, max }, role: field }));
  fieldValues.forEach((entry, index) => {
    if (typeof entry !== "string" || Array.from(entry).length > maxCharacters) {
      issues.push(makeIssue(TEXT_LIMIT_EXCEEDED, "ERROR", "google.text_limit_exceeded", `/platformFields/${field}/${index}`, { actual: typeof entry === "string" ? Array.from(entry).length : entry, expected: maxCharacters, role: field }));
    }
  });
}

function validateRoleCardinality(manifest: CreativeAssetSetManifest, rule: { role: string; required: boolean; min: number; max: number; profileIds: readonly string[] }, contracts: GoogleStaticContracts, issues: GoogleValidationIssue[]): GoogleAssetArtifact[] {
  const assets = roleAssets(manifest, rule.role, contracts);
  if (rule.required && assets.length < rule.min) {
    issues.push(makeIssue(REQUIRED_ROLE_MISSING, "ERROR", "google.required_role_missing", "/assets", { actual: assets.length, expected: { role: rule.role, min: rule.min }, role: rule.role }));
  }
  if (assets.length > rule.max) {
    issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: assets.length, expected: { role: rule.role, max: rule.max }, role: rule.role }));
  }
  for (const asset of assets) {
    if (rule.profileIds.length > 0 && !rule.profileIds.includes(asset.assetProfileId)) {
      issues.push(makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_profile_unknown", `/assets/${asset.ordinal}/assetProfileId`, { actual: asset.assetProfileId, expected: rule.profileIds, profileId: asset.assetProfileId, artifactId: asset.artifactId, role: rule.role }));
    }
  }
  return assets;
}

function validateManifestShape(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts, target?: GoogleStaticTarget): GoogleValidationIssue[] {
  const issues: GoogleValidationIssue[] = [];
  const capability = resolveGoogleCapability(manifest.capabilityId, contracts);
  if (!capability) {
    issues.push(makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_profile_unknown", "/capabilityId", { actual: manifest.capabilityId, expected: contracts.mapping.capabilities.map((entry) => entry.capabilityId) }));
    return issues;
  }
  if (manifest.schemaVersion !== "1.0.0" || typeof manifest.lifecycleSnapshot !== "string" || !Array.isArray(manifest.assets)) {
    issues.push(makeIssue(REQUIRED_ROLE_MISSING, "ERROR", "google.manifest_required_field_missing", "", { actual: manifest }));
    return issues;
  }
  const ordinals = manifest.assets.map((asset) => asset.ordinal);
  const ordinalSet = new Set(ordinals);
  if (ordinalSet.size !== ordinals.length || ordinals.some((ordinal, index) => ordinal !== index)) {
    issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.asset_ordinal_not_deterministic", "/assets", { actual: ordinals, expected: manifest.assets.map((_, index) => index) }));
  }
  manifest.assets.forEach((asset) => {
    issues.push(...validateGoogleStaticArtifact(asset, contracts, { ...(target === undefined ? {} : { target }), path: `/assets/${asset.ordinal}` }));
  });
  if (capability.runtimeStatus !== "IMPLEMENTED") {
    issues.push(makeIssue(LIFECYCLE_INFO, "INFO", "google.lifecycle_transitional", "/capabilityId", { actual: capability.runtimeStatus }));
  }
  return issues;
}

export function validateGoogleCreativeAssetSetManifest(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  return splitGoogleValidationIssues(validateManifestShape(manifest, contracts));
}

function validateRda(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationIssue[] {
  const issues = validateManifestShape(manifest, contracts, "RDA");
  const capability = resolveGoogleCapability("GOOGLE_RDA_ASSET_SET", contracts);
  for (const rule of capability?.roles ?? []) validateRoleCardinality(manifest, rule, contracts, issues);
  const marketing = roleAssets(manifest, "LANDSCAPE_MARKETING_IMAGE", contracts).length + roleAssets(manifest, "SQUARE_MARKETING_IMAGE", contracts).length + roleAssets(manifest, "VERTICAL_MARKETING_IMAGE", contracts).length;
  const logos = roleAssets(manifest, "SQUARE_LOGO", contracts).length + roleAssets(manifest, "LANDSCAPE_LOGO", contracts).length;
  if (marketing > 15) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: marketing, expected: 15, role: "MARKETING_IMAGE" }));
  if (logos > 5) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: logos, expected: 5, role: "LOGO" }));
  validateTextField(manifest, "SHORT_HEADLINE", 1, 5, 30, issues);
  validateTextField(manifest, "LONG_HEADLINE", 1, 1, 90, issues);
  validateTextField(manifest, "DESCRIPTION", 1, 5, 90, issues);
  validateTextField(manifest, "BUSINESS_NAME", 1, 1, 25, issues);
  if (roleAssets(manifest, "VERTICAL_MARKETING_IMAGE", contracts).length > 0) issues.push(makeIssue(RDA_VERTICAL_INFO, "INFO", "google.rda_vertical_source_discrepancy", "/assets", { role: "VERTICAL_MARKETING_IMAGE" }));
  return issues;
}

export function validateGoogleRdaDeliverySet(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  return splitGoogleValidationIssues(validateRda(manifest, contracts));
}

function validatePmax(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationIssue[] {
  const issues = validateManifestShape(manifest, contracts, "PMAX");
  const capability = resolveGoogleCapability("GOOGLE_PMAX_ASSET_GROUP_STATIC", contracts);
  for (const rule of capability?.roles ?? []) {
    if (!["HEADLINE", "LONG_HEADLINE", "DESCRIPTION", "CALL_TO_ACTION_SELECTION"].includes(rule.role)) validateRoleCardinality(manifest, rule, contracts, issues);
  }
  validateTextField(manifest, "HEADLINE", 3, 15, 30, issues);
  validateTextField(manifest, "LONG_HEADLINE", 1, 5, 90, issues);
  validateTextField(manifest, "DESCRIPTION", 2, 5, 90, issues);
  validateTextField(manifest, "BUSINESS_NAME", 1, 1, 90, issues);
  const ctaValues = values(fieldValue(manifest, "CALL_TO_ACTION_SELECTION"));
  if (ctaValues.length > 1) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/platformFields/CALL_TO_ACTION_SELECTION", { actual: ctaValues.length, expected: 1, role: "CALL_TO_ACTION_SELECTION" }));
  const mode = manifest.brandGuidelinesEnabled;
  const squareLogos = roleAssets(manifest, "SQUARE_LOGO", contracts);
  if (typeof mode !== "boolean" || squareLogos.length < 1 || squareLogos.length > 5) {
    issues.push(makeIssue(PMAX_MODE_MISMATCH, "ERROR", "google.pmax_brand_association_mode_mismatch", "/brandGuidelinesEnabled", { actual: { brandGuidelinesEnabled: mode, squareLogoCount: squareLogos.length }, expected: "boolean discriminator with 1..5 square logos" }));
  }
  const associationLevel = fieldValue(manifest, "PMAX_ASSOCIATION_LEVEL");
  if (associationLevel !== undefined) {
    const expectedAssociationLevel = mode === true ? "CampaignAsset" : "AssetGroupAsset";
    if (associationLevel !== expectedAssociationLevel) {
      issues.push(makeIssue(PMAX_MODE_MISMATCH, "ERROR", "google.pmax_brand_association_mode_mismatch", "/platformFields/PMAX_ASSOCIATION_LEVEL", { actual: associationLevel, expected: expectedAssociationLevel }));
    }
  }
  return issues;
}

export function validateGooglePerformanceMaxDeliverySet(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  return splitGoogleValidationIssues(validatePmax(manifest, contracts));
}

function validateDemandGenSingle(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationIssue[] {
  const issues = validateManifestShape(manifest, contracts, "DEMAND_GEN");
  const capability = resolveGoogleCapability("GOOGLE_DEMAND_GEN_SINGLE_IMAGE", contracts);
  for (const rule of capability?.roles ?? []) validateRoleCardinality(manifest, rule, contracts, issues);
  const marketing = roleAssets(manifest, "HORIZONTAL_IMAGE", contracts).length
    + roleAssets(manifest, "SQUARE_IMAGE", contracts).length
    + roleAssets(manifest, "PORTRAIT_IMAGE", contracts).length
    + roleAssets(manifest, "TALL_PORTRAIT_IMAGE", contracts).length;
  const logos = roleAssets(manifest, "SQUARE_LOGO", contracts).length;
  if (marketing > 20) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: marketing, expected: 20, role: "MARKETING_IMAGE" }));
  if (logos > 5) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: logos, expected: 5, role: "LOGO" }));
  if (roleAssets(manifest, "TALL_PORTRAIT_IMAGE", contracts).length > 0) issues.push(makeIssue(DG_SAFE_ZONE_INFO, "INFO", "google.demandgen_safe_zone_source_required", "/assets", { role: "TALL_PORTRAIT_IMAGE" }));
  validateTextField(manifest, "HEADLINE", 1, 1, 90, issues);
  validateTextField(manifest, "DESCRIPTION", 1, 1, 90, issues);
  validateTextField(manifest, "BUSINESS_NAME", 1, 1, 25, issues);
  return issues;
}

export function validateGoogleDemandGenSingleImageDeliverySet(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  return splitGoogleValidationIssues(validateDemandGenSingle(manifest, contracts));
}

function validateDemandGenUploadedStatic(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationIssue[] {
  const issues = validateManifestShape(manifest, contracts);
  const uploadedProfiles = new Set(contracts.profiles.uploadedDisplayStaticProfiles.map((profile) => profile.profileId));
  const assets = manifest.assets;
  if (assets.length < 1) issues.push(makeIssue(REQUIRED_ROLE_MISSING, "ERROR", "google.required_role_missing", "/assets", { actual: assets.length, expected: { min: 1, max: 20 }, role: "UPLOADED_DISPLAY_STATIC" }));
  if (assets.length > 20) issues.push(makeIssue(ROLE_CARDINALITY_EXCEEDED, "ERROR", "google.role_cardinality_exceeded", "/assets", { actual: assets.length, expected: 20, role: "UPLOADED_DISPLAY_STATIC" }));
  for (const asset of assets) {
    if (!uploadedProfiles.has(asset.assetProfileId) || asset.role !== "UPLOADED_DISPLAY_STATIC") {
      issues.push(makeIssue(UNKNOWN_PROFILE, "ERROR", "google.asset_profile_unknown", `/assets/${asset.ordinal}`, { actual: { profileId: asset.assetProfileId, role: asset.role }, expected: [...uploadedProfiles], profileId: asset.assetProfileId, artifactId: asset.artifactId }));
    }
    issues.push(...validateGoogleStaticArtifact(asset, contracts, { target: "DEMAND_GEN_UPLOADED_DISPLAY_STATIC", path: `/assets/${asset.ordinal}` }));
  }
  return issues;
}

export function validateGoogleDemandGenUploadedDisplayStaticSet(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  return splitGoogleValidationIssues(validateDemandGenUploadedStatic(manifest, contracts));
}

export function validateGoogleDeliverySet(manifest: CreativeAssetSetManifest, contracts: GoogleStaticContracts): GoogleValidationResult {
  switch (manifest.capabilityId) {
    case "GOOGLE_RDA_ASSET_SET": return validateGoogleRdaDeliverySet(manifest, contracts);
    case "GOOGLE_PMAX_ASSET_GROUP_STATIC": return validateGooglePerformanceMaxDeliverySet(manifest, contracts);
    case "GOOGLE_DEMAND_GEN_SINGLE_IMAGE": return validateGoogleDemandGenSingleImageDeliverySet(manifest, contracts);
    case "GOOGLE_DEMAND_GEN_UPLOADED_DISPLAY_STATIC": return validateGoogleDemandGenUploadedDisplayStaticSet(manifest, contracts);
    default: return validateGoogleCreativeAssetSetManifest(manifest, contracts);
  }
}

export const GOOGLE_STATIC_DIAGNOSTIC_CODES = Object.freeze({
  UNKNOWN_PROFILE,
  CANVAS_MISMATCH,
  MIME_UNSUPPORTED,
  BYTES_EXCEEDED,
  REQUIRED_ROLE_MISSING,
  ROLE_CARDINALITY_EXCEEDED,
  TEXT_LIMIT_EXCEEDED,
  PMAX_MODE_MISMATCH,
  RDA_VERTICAL_INFO,
  DG_SAFE_ZONE_INFO,
  LIFECYCLE_INFO,
});

export type { GoogleStaticMime };
