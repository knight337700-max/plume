import { createHmac, timingSafeEqual } from "node:crypto";

export interface CursorPayload {
  readonly id: string;
  readonly sortValue: string | number;
  readonly direction?: "next" | "prev";
}

const defaultSecret = () => process.env.CURSOR_SECRET ?? "plume-development-cursor-secret";

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function encodeCursor(payload: CursorPayload, secret = defaultSecret()): string {
  const body = Buffer.from(JSON.stringify({ v: 1, ...payload }), "utf8").toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeCursor(cursor: string, secret = defaultSecret()): CursorPayload {
  const [body, provided] = cursor.split(".");
  if (!body || !provided) throw new Error("Invalid cursor");
  const expected = signature(body, secret);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error("Invalid cursor signature");
  }
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload & {
    v?: number;
  };
  if (parsed.v !== 1 || !parsed.id || parsed.sortValue === undefined)
    throw new Error("Invalid cursor payload");
  return {
    id: parsed.id,
    sortValue: parsed.sortValue,
    ...(parsed.direction ? { direction: parsed.direction } : {}),
  };
}
