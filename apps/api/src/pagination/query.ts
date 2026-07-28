import { decodeCursor, type CursorPayload } from "./cursor.js";

export interface PaginationQuery {
  readonly limit: number;
  readonly sort: string;
  readonly direction: "asc" | "desc";
  readonly cursor?: CursorPayload;
}

export function parsePaginationQuery(
  input: { limit?: string | number; sort?: string; direction?: string; cursor?: string },
  allowedSortFields: readonly string[],
): PaginationQuery {
  const sort = input.sort ?? allowedSortFields[0];
  if (!sort || !allowedSortFields.includes(sort))
    throw new Error(`Sort field is not allowed: ${sort ?? ""}`);
  const requestedLimit = Number(input.limit ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
    : 25;
  const direction = input.direction === "asc" ? "asc" : "desc";
  return {
    limit,
    sort,
    direction,
    ...(input.cursor ? { cursor: decodeCursor(input.cursor) } : {}),
  };
}
