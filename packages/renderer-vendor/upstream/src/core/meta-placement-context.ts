export const META_PLACEMENT_CONTEXTS = [
  "FACEBOOK_FEED",
  "INSTAGRAM_FEED",
  "FACEBOOK_STORIES",
  "INSTAGRAM_STORIES",
  "FACEBOOK_REELS",
  "INSTAGRAM_REELS",
  "INSTAGRAM_EXPLORE",
  "FEED",
  "STORIES",
  "REELS",
] as const;

export type MetaPlacementContext = (typeof META_PLACEMENT_CONTEXTS)[number];
export type MetaPlacementContextSource = "EXPLICIT_REQUEST" | "DEFAULT_NONE";

export type MetaPlacementContextResolution = Readonly<{
  requested: string | null;
  resolved: string | null;
  source: MetaPlacementContextSource;
  path: "/placementContext" | "/metaStatic/placementContext" | null;
  legacyNestedValue?: string | null;
  conflict: boolean;
}>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isMetaPlacementContext(value: unknown): value is MetaPlacementContext {
  return typeof value === "string" && (META_PLACEMENT_CONTEXTS as readonly string[]).includes(value);
}

/**
 * Resolve request context without consulting UI defaults. The top-level
 * Render Request field is canonical; the nested metaStatic field is retained
 * as a compatibility read path for older callers and is never copied into a
 * CreativeLayoutPlan.
 */
export function resolveMetaPlacementContext(request: unknown): MetaPlacementContextResolution {
  const raw = isRecord(request) ? request : null;
  const topLevel = typeof raw?.placementContext === "string" ? raw.placementContext : null;
  const nested = isRecord(raw?.metaStatic) && typeof raw.metaStatic.placementContext === "string"
    ? raw.metaStatic.placementContext
    : null;
  const requested = topLevel ?? nested;
  return {
    requested,
    resolved: requested,
    source: requested === null ? "DEFAULT_NONE" : "EXPLICIT_REQUEST",
    path: topLevel !== null ? "/placementContext" : nested !== null ? "/metaStatic/placementContext" : null,
    ...(nested !== null ? { legacyNestedValue: nested } : {}),
    conflict: topLevel !== null && nested !== null && topLevel !== nested,
  };
}

export function isStoriesPlacementContext(value: unknown): boolean {
  return value === "FACEBOOK_STORIES" || value === "INSTAGRAM_STORIES" || value === "STORIES";
}

export function isReelsPlacementContext(value: unknown): boolean {
  return value === "FACEBOOK_REELS" || value === "INSTAGRAM_REELS" || value === "REELS";
}
