import { createHash } from "node:crypto";
import type { CreativeDocument } from "./creative-document.js";
export function canonicalizeDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeDocument);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizeDocument(child)]),
  );
}
export function canonicalDocumentJson(document: CreativeDocument): string {
  return JSON.stringify(canonicalizeDocument(document));
}
export function hashCreativeDocument(document: CreativeDocument): string {
  return createHash("sha256").update(canonicalDocumentJson(document)).digest("hex");
}
