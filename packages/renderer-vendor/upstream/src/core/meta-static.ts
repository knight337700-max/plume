import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CreativeLayoutPlan, FormatProfile } from "@kbr/renderer-contract";

import { canonicalDigest, canonicalJson } from "./canonical.js";
import type { ContractBundle } from "./contracts.js";
import { loadContracts } from "./contracts.js";
import { createIssue, sortAndDedupeIssues, splitIssues } from "./errors.js";
import { sha256Bytes } from "./hash.js";
import { resolveTrustedJobDirectory } from "./path-security.js";
import { publishCollectionArtifacts, PublishError } from "./publish.js";
import {
  renderFreeform,
  renderFreeformPreviewArtifact,
  type FreeformAssetInput,
  type FreeformRenderOptions,
  type FreeformRenderRequest,
  type FreeformRenderResult,
} from "./freeform.js";
import type { ValidationIssue } from "./types.js";

export const META_STATIC_PROFILE_ORDER = [
  "META_STATIC_FEED_SQUARE",
  "META_STATIC_FEED_PORTRAIT",
  "META_STATIC_VERTICAL_FULL",
] as const;
export const META_STATIC_PLACEMENT_SET_ID = "META_STATIC_PLACEMENT_SET_V1" as const;
export type MetaStaticProfileId = (typeof META_STATIC_PROFILE_ORDER)[number];
export type MetaStaticPlacementContext =
  | "FACEBOOK_FEED"
  | "INSTAGRAM_FEED"
  | "FACEBOOK_STORIES"
  | "INSTAGRAM_STORIES"
  | "FACEBOOK_REELS"
  | "INSTAGRAM_REELS"
  | "INSTAGRAM_EXPLORE"
  | "FEED"
  | "STORIES"
  | "REELS";

export type MetaPlatformCopy = Readonly<{
  primaryText?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  destinationUrl?: string;
}>;

export type MetaStaticVariant = Readonly<{
  formatProfileId?: MetaStaticProfileId | string;
  creativeLayoutPlan: CreativeLayoutPlan;
  placementContext?: MetaStaticPlacementContext | string;
}>;

export type MetaStaticPlacementSetRequest = Readonly<{
  schemaVersion?: string;
  formatProfileId?: string;
  layoutMode?: "FREEFORM";
  assets?: FreeformAssetInput[] | Readonly<Record<string, unknown>>;
  output?: FreeformRenderRequest["output"];
  placementContext?: MetaStaticPlacementContext | string;
  provenance?: Readonly<Record<string, unknown>>;
  metaStatic: Readonly<{
    mode: "PLACEMENT_SET";
    conceptId?: string;
    sharedLayerIds?: readonly string[];
    placementContext?: string;
    platformCopy?: MetaPlatformCopy;
    variants: Readonly<Partial<Record<MetaStaticProfileId, MetaStaticVariant>>>;
  }>;
  /** Additive input alias matching the canonical placementSet envelope. */
  placementSet?: Readonly<{
    conceptId?: string;
    sharedLayerIds?: readonly string[];
    variants: Readonly<Partial<Record<MetaStaticProfileId, MetaStaticVariant | CreativeLayoutPlan>>>;
  }>;
}>;

export type MetaStaticCollectionArtifact = Readonly<{
  profileId: MetaStaticProfileId;
  fileName: string;
  format: "PNG" | "JPEG";
  bytes: number;
  sha256: string;
  requestFingerprint: string | null;
  pixelFingerprint: string | null;
  warnings: ValidationIssue[];
}>;

export type MetaStaticCollectionResult = Readonly<{
  mode: "PLACEMENT_SET";
  status: "PASS" | "BLOCKED";
  png: Buffer | null;
  pngDigest: string | null;
  manifestDigest: string | null;
  manifestPath: string | null;
  pngPath: string | null;
  downloadAllowed: boolean;
  formatProfileId: null;
  artifactChecksumSha256: string | null;
  pixelFingerprint: string | null;
  requestFingerprint: string | null;
  renderFingerprint: string | null;
  artifactFormat: "PNG" | "JPEG" | null;
  artifactDigest: string | null;
  artifactPath: string | null;
  outputEncoding: null;
  appliedElements: [];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  collectionFingerprint: string | null;
  collectionManifestPath: string | null;
  collectionArtifactPaths: string[];
  collectionArtifacts: MetaStaticCollectionArtifact[];
  manifest: Record<string, unknown> | null;
}>;

export type MetaStaticRenderResult = FreeformRenderResult | MetaStaticCollectionResult;

type ProfileRegistry = Readonly<{ profiles?: readonly FormatProfile[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMetaProfile(profile: FormatProfile | undefined): profile is FormatProfile {
  return profile?.channelNamespace === "META" && profile.compositionMode === "RENDERER_COMPOSED" && profile.layoutMode === "FREEFORM";
}

async function loadMetaProfiles(projectRoot: string): Promise<ReadonlyMap<string, FormatProfile>> {
  const raw = JSON.parse(await readFile(path.join(projectRoot, "contracts", "freeform-format-profiles.json"), "utf8")) as ProfileRegistry;
  return new Map((raw.profiles ?? []).filter(isMetaProfile).map((profile) => [profile.formatProfileId, profile]));
}

function collectionIssue(contracts: ContractBundle, code: string, pathValue: string, actual?: unknown, expected?: unknown): ValidationIssue {
  return createIssue(contracts.errorRegistry, code, pathValue, {
    ...(actual === undefined ? {} : { actual }),
    ...(expected === undefined ? {} : { expected }),
    stage: "PRE_RENDER",
  });
}

function blockedCollection(issues: readonly ValidationIssue[], fingerprint: string | null = null): MetaStaticCollectionResult {
  const sorted = sortAndDedupeIssues(issues);
  const split = splitIssues(sorted);
  return {
    mode: "PLACEMENT_SET",
    status: "BLOCKED",
    png: null,
    pngDigest: null,
    manifestDigest: null,
    manifestPath: null,
    pngPath: null,
    downloadAllowed: false,
    formatProfileId: null,
    artifactChecksumSha256: null,
    pixelFingerprint: null,
    requestFingerprint: fingerprint,
    renderFingerprint: null,
    artifactFormat: null,
    artifactDigest: null,
    artifactPath: null,
    outputEncoding: null,
    appliedElements: [],
    errors: split.errors,
    warnings: split.warnings,
    collectionFingerprint: fingerprint,
    collectionManifestPath: null,
    collectionArtifactPaths: [],
    collectionArtifacts: [],
    manifest: null,
  };
}

function artifactFileName(profileId: MetaStaticProfileId, format: "PNG" | "JPEG"): string {
  return `${profileId}.${format === "JPEG" ? "jpg" : "png"}`;
}

function variantFromValue(profileId: MetaStaticProfileId, value: unknown): MetaStaticVariant | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.creativeLayoutPlan)) {
    return {
      formatProfileId: typeof value.formatProfileId === "string" ? value.formatProfileId : profileId,
      creativeLayoutPlan: value.creativeLayoutPlan as CreativeLayoutPlan,
      ...(typeof value.placementContext === "string" ? { placementContext: value.placementContext } : {}),
    };
  }
  if (typeof value.schemaVersion === "string" && Array.isArray(value.elements)) {
    return { formatProfileId: profileId, creativeLayoutPlan: value as unknown as CreativeLayoutPlan };
  }
  return null;
}

function normalizePlacementSetRequest(value: unknown): MetaStaticPlacementSetRequest | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.metaStatic) && value.metaStatic.mode === "PLACEMENT_SET") return value as unknown as MetaStaticPlacementSetRequest;
  if (!isRecord(value.placementSet) || !isRecord(value.placementSet.variants)) return null;
  const placementSet = value.placementSet;
  return {
    ...(value as Omit<MetaStaticPlacementSetRequest, "metaStatic">),
    metaStatic: {
      mode: "PLACEMENT_SET",
      ...(typeof placementSet.conceptId === "string" ? { conceptId: placementSet.conceptId } : {}),
      ...(Array.isArray(placementSet.sharedLayerIds) ? { sharedLayerIds: placementSet.sharedLayerIds.filter((entry): entry is string => typeof entry === "string") } : {}),
      variants: placementSet.variants as Readonly<Partial<Record<MetaStaticProfileId, MetaStaticVariant>>>,
    },
  };
}

function childRequest(
  request: MetaStaticPlacementSetRequest,
  profileId: MetaStaticProfileId,
  variant: MetaStaticVariant,
): FreeformRenderRequest {
  const meta = request.metaStatic;
  // A placement-set collection describes geometry variants.  A vertical
  // child stays neutral unless that child explicitly names Stories/Reels;
  // collection-level feed context must not silently route it to FACEBOOK_FEED.
  const requestedContext = variant.placementContext
    ?? (profileId === "META_STATIC_VERTICAL_FULL" ? undefined : request.placementContext ?? meta.placementContext);
  return {
    ...(request.schemaVersion ? { schemaVersion: request.schemaVersion } : {}),
    formatProfileId: variant.formatProfileId ?? profileId,
    layoutMode: "FREEFORM",
    creativeLayoutPlan: variant.creativeLayoutPlan,
    ...(requestedContext ? { placementContext: requestedContext } : {}),
    ...(request.assets !== undefined ? { assets: request.assets as NonNullable<FreeformRenderRequest["assets"]> } : {}),
    ...(request.output ? { output: request.output } : {}),
    ...(request.provenance ? { provenance: request.provenance } : {}),
    metaStatic: {
      mode: "SINGLE",
      ...(requestedContext ? { placementContext: requestedContext } : {}),
      ...(meta.conceptId ? { conceptId: meta.conceptId } : {}),
      variantId: profileId,
      ...(meta.platformCopy ? { platformCopy: meta.platformCopy } : {}),
    },
  };
}

async function renderPlacementSet(
  request: MetaStaticPlacementSetRequest,
  options: FreeformRenderOptions,
): Promise<MetaStaticCollectionResult> {
  const contracts = options.contracts ?? await loadContracts(options.projectRoot);
  const variants = request.metaStatic?.variants;
  const missing = META_STATIC_PROFILE_ORDER.filter((profileId) => !variants || !variants[profileId]);
  const collectionFingerprint = canonicalDigest({
    contract: META_STATIC_PLACEMENT_SET_ID,
    conceptId: request.metaStatic?.conceptId ?? null,
    sharedLayerIds: request.metaStatic?.sharedLayerIds ?? [],
    platformCopy: request.metaStatic?.platformCopy ?? null,
    variants: META_STATIC_PROFILE_ORDER.map((profileId) => {
      const value = variants?.[profileId];
      const parsed = value ? variantFromValue(profileId, value) : null;
      return { profileId, plan: parsed?.creativeLayoutPlan ?? null, placementContext: parsed?.placementContext ?? null };
    }),
  });
  if (missing.length > 0) {
    return blockedCollection([collectionIssue(contracts, "KBR-META-PLACEMENT-SET-INCOMPLETE", "/metaStatic/variants", missing, META_STATIC_PROFILE_ORDER)], collectionFingerprint);
  }
  const children: Array<{ profileId: MetaStaticProfileId; result: FreeformRenderResult }> = [];
  const childIssues: ValidationIssue[] = [];
  for (const profileId of META_STATIC_PROFILE_ORDER) {
    const variant = variantFromValue(profileId, variants?.[profileId]);
    if (!variant) {
      childIssues.push(collectionIssue(contracts, "KBR-META-PLACEMENT-SET-INCOMPLETE", `/metaStatic/variants/${profileId}`, variants?.[profileId], "creativeLayoutPlan"));
      continue;
    }
    const result = await renderFreeformPreviewArtifact(childRequest(request, profileId, variant), { ...options, publish: false });
    children.push({ profileId, result });
    if (result.errors.length > 0) childIssues.push(...result.errors);
    const requiredSharedLayerIds = request.metaStatic?.sharedLayerIds ?? [];
    if (requiredSharedLayerIds.length > 0) {
      const elementIds = new Set((variant.creativeLayoutPlan.elements ?? []).map((element) => element.id));
      const missingSharedLayerIds = requiredSharedLayerIds.filter((id) => !elementIds.has(id));
      if (missingSharedLayerIds.length > 0) childIssues.push(collectionIssue(contracts, "KBR-META-PLACEMENT-SET-INCOMPLETE", `/metaStatic/variants/${profileId}/creativeLayoutPlan/elements`, missingSharedLayerIds, requiredSharedLayerIds));
    }
  }
  if (childIssues.length > 0 || children.length !== META_STATIC_PROFILE_ORDER.length) {
    const errors = childIssues.length > 0
      ? childIssues
      : [collectionIssue(contracts, "KBR-META-PLACEMENT-SET-CHILD-BLOCKED", "/metaStatic/variants")];
    return blockedCollection(errors, collectionFingerprint);
  }
  const collectionArtifacts: MetaStaticCollectionArtifact[] = children.map(({ profileId, result }) => ({
    profileId,
    fileName: artifactFileName(profileId, result.artifactFormat ?? "PNG"),
    format: result.artifactFormat ?? "PNG",
    bytes: result.png?.byteLength ?? 0,
    sha256: result.artifactDigest ?? result.pngDigest ?? sha256Bytes(Buffer.alloc(0)),
    requestFingerprint: result.requestFingerprint,
    pixelFingerprint: result.pixelFingerprint,
    warnings: result.warnings,
  }));
  const manifest = {
    schemaVersion: "1.0.0",
    contractId: META_STATIC_PLACEMENT_SET_ID,
    compositionMode: "RENDERER_COMPOSED",
    artifactCardinality: "COLLECTION",
    channel: "META",
    conceptId: request.metaStatic?.conceptId ?? null,
    sharedLayerIds: request.metaStatic?.sharedLayerIds ?? [],
    order: [...META_STATIC_PROFILE_ORDER],
    items: collectionArtifacts.map((artifact) => ({
      profileId: artifact.profileId,
      fileName: artifact.fileName,
      format: artifact.format,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      requestFingerprint: artifact.requestFingerprint,
      pixelFingerprint: artifact.pixelFingerprint,
    })),
    platformCopy: request.metaStatic?.platformCopy ?? null,
    collectionFingerprint,
    manualAcceptanceStatus: "NOT_REVIEWED",
    downloadAllowed: options.publish !== false,
    sourceProvenance: {
      sourcePolicy: "M0_OFFICIAL_META_SOURCE_REGISTRY",
      pixelPresetPolicy: "PROJECT_OUTPUT_PRESET_V1",
      reelsSafeZoneGeometry: "SOURCE_REQUIRED_INFO_ONLY",
    },
  } satisfies Record<string, unknown>;
  const manifestText = canonicalJson(manifest);
  const manifestDigest = sha256Bytes(Buffer.from(manifestText, "utf8"));
  const first = children[0]?.result;
  if (!first || collectionArtifacts.some((artifact) => artifact.bytes <= 0)) {
    return blockedCollection([collectionIssue(contracts, "KBR-META-PLACEMENT-SET-CHILD-BLOCKED", "/metaStatic/variants", collectionArtifacts, "non-empty artifacts")], collectionFingerprint);
  }
  if (options.publish === false) {
    const split = splitIssues(sortAndDedupeIssues(children.flatMap(({ result }) => result.warnings)));
    return {
      mode: "PLACEMENT_SET",
      status: "PASS",
      png: first.png,
      pngDigest: first.pngDigest,
      manifestDigest,
      manifestPath: null,
      pngPath: null,
      downloadAllowed: false,
      formatProfileId: null,
      artifactChecksumSha256: first.artifactChecksumSha256,
      pixelFingerprint: first.pixelFingerprint,
      requestFingerprint: collectionFingerprint,
      renderFingerprint: collectionFingerprint,
      artifactFormat: first.artifactFormat,
      artifactDigest: first.artifactDigest,
      artifactPath: null,
      outputEncoding: null,
      appliedElements: [],
      errors: [],
      warnings: split.warnings,
      collectionFingerprint,
      collectionManifestPath: null,
      collectionArtifactPaths: [],
      collectionArtifacts,
      manifest,
    };
  }
  let jobDirectory: string;
  try {
    const output = request.output ?? {};
    jobDirectory = await resolveTrustedJobDirectory(options.outputRoot, output.directory ?? "meta-static", output.baseName ?? "placement-set");
    const published = await publishCollectionArtifacts({
      outputRoot: options.outputRoot,
      jobDirectory,
      artifacts: children.map(({ profileId, result }) => ({
        fileName: artifactFileName(profileId, result.artifactFormat ?? "PNG"),
        bytes: result.png ?? Buffer.alloc(0),
      })),
      manifest: manifestText,
      manifestFileName: "meta-placement-set-manifest.json",
      overwrite: output.overwrite ?? false,
    });
    const paths = published.artifactPaths;
    return {
      mode: "PLACEMENT_SET",
      status: "PASS",
      png: first.png,
      pngDigest: first.pngDigest,
      manifestDigest,
      manifestPath: published.manifestPath,
      pngPath: paths[0] ?? null,
      downloadAllowed: true,
      formatProfileId: null,
      artifactChecksumSha256: first.artifactChecksumSha256,
      pixelFingerprint: first.pixelFingerprint,
      requestFingerprint: collectionFingerprint,
      renderFingerprint: collectionFingerprint,
      artifactFormat: first.artifactFormat,
      artifactDigest: first.artifactDigest,
      artifactPath: paths[0] ?? null,
      outputEncoding: null,
      appliedElements: [],
      errors: [],
      warnings: children.flatMap(({ result }) => result.warnings),
      collectionFingerprint,
      collectionManifestPath: published.manifestPath,
      collectionArtifactPaths: paths,
      collectionArtifacts,
      manifest,
    };
  } catch (error) {
    const code = error instanceof PublishError ? error.code : "KBR-SYSTEM-004";
    return blockedCollection([collectionIssue(contracts, code, "/output", error instanceof Error ? error.message : "collection publish failed")], collectionFingerprint);
  }
}

export function isMetaStaticPlacementSetRequest(value: unknown): value is MetaStaticPlacementSetRequest {
  return normalizePlacementSetRequest(value) !== null;
}

export async function renderMetaStatic(
  request: FreeformRenderRequest | MetaStaticPlacementSetRequest,
  options: FreeformRenderOptions,
): Promise<MetaStaticRenderResult> {
  const placementSetRequest = normalizePlacementSetRequest(request);
  if (placementSetRequest) return renderPlacementSet(placementSetRequest, options);
  const freeformRequest = request as FreeformRenderRequest;
  const normalized = isRecord(freeformRequest) && (freeformRequest.assetProfileId || freeformRequest.platformCopy || freeformRequest.placementContext)
    ? {
      ...freeformRequest,
      formatProfileId: freeformRequest.formatProfileId ?? freeformRequest.assetProfileId,
      metaStatic: {
        ...(freeformRequest.metaStatic ?? {}),
        ...(freeformRequest.placementContext ? { placementContext: freeformRequest.placementContext } : {}),
        ...(freeformRequest.platformCopy ? { platformCopy: freeformRequest.platformCopy } : {}),
      },
    } as FreeformRenderRequest
    : freeformRequest;
  return renderFreeform(normalized, options);
}

export async function renderMetaStaticPreviewArtifact(
  request: FreeformRenderRequest | MetaStaticPlacementSetRequest,
  options: FreeformRenderOptions,
): Promise<MetaStaticRenderResult> {
  const placementSetRequest = normalizePlacementSetRequest(request);
  if (placementSetRequest) return renderPlacementSet(placementSetRequest, { ...options, publish: false });
  const freeformRequest = request as FreeformRenderRequest;
  const normalized = isRecord(freeformRequest) && (freeformRequest.assetProfileId || freeformRequest.platformCopy || freeformRequest.placementContext)
    ? {
      ...freeformRequest,
      formatProfileId: freeformRequest.formatProfileId ?? freeformRequest.assetProfileId,
      metaStatic: {
        ...(freeformRequest.metaStatic ?? {}),
        ...(freeformRequest.placementContext ? { placementContext: freeformRequest.placementContext } : {}),
        ...(freeformRequest.platformCopy ? { platformCopy: freeformRequest.platformCopy } : {}),
      },
    } as FreeformRenderRequest
    : freeformRequest;
  return renderFreeformPreviewArtifact(normalized, { ...options, publish: false });
}

export async function loadMetaStaticProfiles(projectRoot: string): Promise<ReadonlyMap<string, FormatProfile>> {
  return loadMetaProfiles(projectRoot);
}
