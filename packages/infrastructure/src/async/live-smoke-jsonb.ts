export interface RedactedJsonStringArrayOptions {
  readonly maximumItems?: number;
  readonly accept?: (value: string) => boolean;
}

const DEFAULT_MAXIMUM_ITEMS = 20;

function maximumItems(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAXIMUM_ITEMS;
  return Math.min(DEFAULT_MAXIMUM_ITEMS, Math.max(0, Math.floor(value)));
}

/**
 * Serializes redacted string paths as deterministic JSON text for an explicit
 * PostgreSQL `::jsonb` cast. The input is never mutated and missing input is
 * represented by an explicit JSON array rather than a SQL NULL.
 */
export function serializeRedactedJsonStringArray(
  values: readonly string[] | undefined,
  options: RedactedJsonStringArrayOptions = {},
): string {
  const limit = maximumItems(options.maximumItems);
  if (limit === 0) return "[]";
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (options.accept !== undefined && !options.accept(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }

  return JSON.stringify(result);
}
