import { createHash } from "node:crypto";

/**
 * Contract sources are text artifacts. Hash their canonical UTF-8 form so
 * checkout line endings cannot change the generated provenance metadata.
 */
export function normalizeContractText(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function hashContractText(value: string): string {
  return createHash("sha256")
    .update(normalizeContractText(value), "utf8")
    .digest("hex")
    .toUpperCase();
}
