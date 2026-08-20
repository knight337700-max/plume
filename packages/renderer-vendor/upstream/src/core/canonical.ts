import canonicalize from "canonicalize";

import { sha256Bytes } from "./hash.js";

export function canonicalJson(value: unknown): string {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new Error("Value cannot be serialized as RFC 8785 JCS");
  return serialized;
}

export function canonicalDigest(value: unknown): string {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}
