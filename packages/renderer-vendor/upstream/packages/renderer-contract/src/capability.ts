import type { FormatProfile, LayoutMode } from "./freeform.js";

/** Canonical top-level channel namespaces. Placement identifiers remain scoped to a channel. */
export const CHANNEL_IDS = ["KAKAO_MOMENT", "NAVER_GFA", "META"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Orthogonal answer to “who composes the final ad UI?”. */
export const COMPOSITION_MODES = ["RENDERER_COMPOSED", "PLATFORM_COMPOSED"] as const;
export type CompositionMode = (typeof COMPOSITION_MODES)[number];

/** Orthogonal answer to “how many artifacts belong to this format?”. */
export const ARTIFACT_CARDINALITIES = ["SINGLE", "COLLECTION"] as const;
export type ArtifactCardinality = (typeof ARTIFACT_CARDINALITIES)[number];

/** Naver GFA placement namespace reserved by N1A; no pixel profile is implied. */
export const NAVER_GFA_PLACEMENTS = [
  "SMARTCHANNEL",
  "MOBILE_DA",
  "IMAGE_BANNER_1_1",
  "MOBILE_NATIVE",
  "PC_NATIVE",
  "SHOPPING_NEWS",
  "COMMUNICATION_AD",
  "MOBILE_DA_FEED",
] as const;
export type NaverGfaPlacement = (typeof NAVER_GFA_PLACEMENTS)[number];

export type CapabilityRuntimeStatus = "IMPLEMENTED" | "CONTRACT_ONLY" | "DEFERRED";

/** Capability-level shape. It intentionally has no canvas or pixel geometry. */
export type ChannelPlacementCapability = Readonly<{
  channel: ChannelId;
  placement: string;
  compositionMode?: CompositionMode;
  compositionModes?: readonly CompositionMode[];
  layoutMode?: LayoutMode;
  layoutModes?: readonly LayoutMode[];
  artifactCardinality?: ArtifactCardinality;
  artifactCardinalities?: readonly ArtifactCardinality[];
  runtimeStatus: CapabilityRuntimeStatus;
}>;

export type CapabilityContractIssueCode =
  | "CHANNEL_UNKNOWN"
  | "PLACEMENT_UNKNOWN"
  | "COMPOSITION_MODE_UNKNOWN"
  | "LAYOUT_MODE_REQUIRED"
  | "LAYOUT_MODE_FORBIDDEN"
  | "ARTIFACT_CARDINALITY_UNKNOWN";

export type CapabilityContractIssue = Readonly<{
  code: CapabilityContractIssueCode;
  path: string;
  actual?: unknown;
}>;

export type FormatProfileCapability = FormatProfile & Readonly<{
  /** New namespace field; legacy FormatProfile.channel remains its catalog-family label. */
  channelNamespace: ChannelId;
  compositionMode: CompositionMode;
  artifactCardinality: ArtifactCardinality;
}>;

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && (CHANNEL_IDS as readonly string[]).includes(value);
}

export function isCompositionMode(value: unknown): value is CompositionMode {
  return typeof value === "string" && (COMPOSITION_MODES as readonly string[]).includes(value);
}

export function isArtifactCardinality(value: unknown): value is ArtifactCardinality {
  return typeof value === "string" && (ARTIFACT_CARDINALITIES as readonly string[]).includes(value);
}

export function isNaverGfaPlacement(value: unknown): value is NaverGfaPlacement {
  return typeof value === "string" && (NAVER_GFA_PLACEMENTS as readonly string[]).includes(value);
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === "TEMPLATE_LOCKED" || value === "FREEFORM";
}

/**
 * Validates capability semantics without requiring a concrete renderer profile.
 * The result is deterministic and does not infer missing Naver pixel rules.
 */
export function validateChannelPlacementCapability(value: unknown): CapabilityContractIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ code: "CHANNEL_UNKNOWN", path: "/", actual: typeof value }];
  }
  const candidate = value as Record<string, unknown>;
  const issues: CapabilityContractIssue[] = [];
  if (!isChannelId(candidate.channel)) issues.push({ code: "CHANNEL_UNKNOWN", path: "/channel", actual: candidate.channel });

  const placement = candidate.placement;
  if (candidate.channel === "NAVER_GFA" && !isNaverGfaPlacement(placement)) {
    issues.push({ code: "PLACEMENT_UNKNOWN", path: "/placement", actual: placement });
  } else if (typeof placement !== "string" || placement.length === 0) {
    issues.push({ code: "PLACEMENT_UNKNOWN", path: "/placement", actual: placement });
  }

  const compositionMode = candidate.compositionMode;
  const compositionModes = candidate.compositionModes;
  if (compositionMode !== undefined && !isCompositionMode(compositionMode)) {
    issues.push({ code: "COMPOSITION_MODE_UNKNOWN", path: "/compositionMode", actual: compositionMode });
  }
  if (compositionModes !== undefined && (!Array.isArray(compositionModes) || compositionModes.some((entry) => !isCompositionMode(entry)))) {
    issues.push({ code: "COMPOSITION_MODE_UNKNOWN", path: "/compositionModes", actual: compositionModes });
  }
  const declaredCompositionModes = compositionMode !== undefined
    ? [compositionMode]
    : Array.isArray(compositionModes) ? compositionModes : [];
  if (declaredCompositionModes.length === 0) issues.push({ code: "COMPOSITION_MODE_UNKNOWN", path: "/compositionMode" });

  const layoutMode = candidate.layoutMode;
  const layoutModes = candidate.layoutModes;
  if (layoutMode !== undefined && !isLayoutMode(layoutMode)) issues.push({ code: "LAYOUT_MODE_REQUIRED", path: "/layoutMode", actual: layoutMode });
  if (layoutModes !== undefined && (!Array.isArray(layoutModes) || layoutModes.some((entry) => !isLayoutMode(entry)))) {
    issues.push({ code: "LAYOUT_MODE_REQUIRED", path: "/layoutModes", actual: layoutModes });
  }
  const hasLayout = layoutMode !== undefined || (Array.isArray(layoutModes) && layoutModes.length > 0);
  if (declaredCompositionModes.length === 1 && declaredCompositionModes[0] === "RENDERER_COMPOSED" && !hasLayout) {
    issues.push({ code: "LAYOUT_MODE_REQUIRED", path: "/layoutMode" });
  }
  if (declaredCompositionModes.length === 1 && declaredCompositionModes[0] === "PLATFORM_COMPOSED" && hasLayout) {
    issues.push({ code: "LAYOUT_MODE_FORBIDDEN", path: "/layoutMode", actual: layoutMode ?? layoutModes });
  }

  const artifactCardinality = candidate.artifactCardinality;
  const artifactCardinalities = candidate.artifactCardinalities;
  if (artifactCardinality !== undefined && !isArtifactCardinality(artifactCardinality)) {
    issues.push({ code: "ARTIFACT_CARDINALITY_UNKNOWN", path: "/artifactCardinality", actual: artifactCardinality });
  }
  if (artifactCardinalities !== undefined && (!Array.isArray(artifactCardinalities) || artifactCardinalities.some((entry) => !isArtifactCardinality(entry)))) {
    issues.push({ code: "ARTIFACT_CARDINALITY_UNKNOWN", path: "/artifactCardinalities", actual: artifactCardinalities });
  }
  if (artifactCardinality === undefined && artifactCardinalities === undefined) {
    issues.push({ code: "ARTIFACT_CARDINALITY_UNKNOWN", path: "/artifactCardinality" });
  }
  return issues;
}

/**
 * Materializes the additive semantics for a legacy FormatProfile. The default
 * channel is deliberately limited to existing Kakao/FREEFORM profiles; Naver
 * profiles must declare their namespace explicitly in a future phase.
 */
export function materializeFormatProfileCapability(
  profile: FormatProfile,
  options: Readonly<{ channelNamespace?: ChannelId }> = {},
): FormatProfileCapability {
  const channelNamespace = profile.channelNamespace ?? options.channelNamespace ?? "KAKAO_MOMENT";
  const compositionMode = profile.compositionMode ?? "RENDERER_COMPOSED";
  const artifactCardinality = profile.artifactCardinality ?? "SINGLE";
  return {
    ...profile,
    channelNamespace,
    compositionMode,
    artifactCardinality,
  };
}

export type CompositionDispatchGuardResult =
  | Readonly<{ allowed: true; finalRasterOutputAllowed: true; compositionMode: "RENDERER_COMPOSED" }>
  | Readonly<{
      allowed: false;
      finalRasterOutputAllowed: false;
      status: "NOT_SUPPORTED";
      code: "KBR-COMPOSITION-MODE-NOT-SUPPORTED";
      messageKey: "composition.platform_composed_not_supported";
    }>;

/** Prevents a platform-composed capability from being flattened into a raster. */
export function guardCompositionDispatch(value: Readonly<{ compositionMode?: unknown }>): CompositionDispatchGuardResult {
  if (value.compositionMode === "RENDERER_COMPOSED") {
    return { allowed: true, finalRasterOutputAllowed: true, compositionMode: "RENDERER_COMPOSED" };
  }
  return {
    allowed: false,
    finalRasterOutputAllowed: false,
    status: "NOT_SUPPORTED",
    code: "KBR-COMPOSITION-MODE-NOT-SUPPORTED",
    messageKey: "composition.platform_composed_not_supported",
  };
}
