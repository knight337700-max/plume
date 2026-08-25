import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalFreeformPlan,
  validateCreativeLayoutPlan,
  validateFontReference,
  type CreativeElement,
  type CreativeLayoutPlan,
  type FormatProfile,
  type FreeformFontRegistry,
  type FreeformImageElement,
  type FreeformLogoElement,
  type FreeformTextElement,
  type ImagePlacementSpec,
  type OutputFormat,
} from "@kbr/renderer-contract";

export { canonicalFreeformPlan, validateCreativeLayoutPlan, validateFontReference };
export type {
  CreativeElement,
  CreativeLayoutPlan,
  FormatProfile,
  FreeformFontRegistry,
  FreeformImageElement,
  FreeformLogoElement,
  FreeformTextElement,
  ImagePlacementSpec,
  OutputFormat,
};

export const FREEFORM_CANONICAL_SCHEMA_VERSION = "1.0.0" as const;
export const FREEFORM_CANONICAL_SCHEMA_PATH =
  "packages/renderer-contract/schema/creative-layout-plan-v1.schema.json" as const;
export const FREEFORM_CANONICAL_SCHEMA_SHA256 =
  "059169691206d94fc861d0066cb069dd474cd683f6fdf03f082a84565c1f5c9e" as const;
export const FREEFORM_FORMAT_PROFILE_REGISTRY_PATH =
  "contracts/freeform-format-profiles.json" as const;
export const FREEFORM_FORMAT_PROFILE_REGISTRY_SHA256 =
  "f092f6862c95ee3747085e782f5ef452b54535ccce8589945628fea2ea025f46" as const;
export const FREEFORM_FONT_REGISTRY_PATH = "contracts/freeform-font-registry.json" as const;
export const FREEFORM_FONT_REGISTRY_SHA256 =
  "29b9ced3ec8a284869bb115988e33e368a0d1eb25f936972f9c3d29c7020148f" as const;

export type CanonicalFreeformLayoutPlanSchema = Readonly<Record<string, unknown>>;
export type FreeformFormatProfileRegistry = Readonly<{
  readonly registryVersion: string;
  readonly layoutMode: "FREEFORM";
  readonly catalogStatus: string;
  readonly profiles: readonly FormatProfile[];
  readonly officialProfiles?: readonly FormatProfile[];
  readonly native1200?: Readonly<Record<string, unknown>>;
}>;

type SchemaRecord = Record<string, unknown>;
type SourceLockEntry = Readonly<{
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}>;
type SchemaDocument = Readonly<{
  readonly uri: string;
  readonly root: unknown;
}>;
type ResolverState = {
  readonly runtimeRoot: string;
  readonly schemaDirectory: string;
  readonly sourceLock: ReadonlyMap<string, SourceLockEntry>;
  readonly documents: Map<string, SchemaDocument>;
  readonly resolvedReferences: Map<string, unknown>;
  readonly activeReferences: Set<string>;
};

function defaultRendererRuntimeRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../upstream/", import.meta.url)),
    fileURLToPath(new URL("../../upstream/", import.meta.url)),
  ];
  const found = candidates.find((candidate) => {
    try {
      return Boolean(readFileSync(path.join(candidate, "contracts", "input.schema.json")));
    } catch {
      return false;
    }
  });
  if (!found) throw new Error("RENDERER_VENDOR_RUNTIME_ROOT_MISSING");
  return found;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJsonFile<T>(runtimeRoot: string, relativePath: string, expectedSha256: string): T {
  const bytes = readFileSync(path.join(runtimeRoot, relativePath));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256)
    throw new Error(`FREEFORM_REGISTRY_HASH_MISMATCH:${relativePath}:${actualSha256}`);
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch (error) {
    throw new Error(`FREEFORM_REGISTRY_JSON_INVALID:${relativePath}`, { cause: error });
  }
}

function isSchemaRecord(value: unknown): value is SchemaRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolverError(code: string, detail?: string): Error {
  return new Error(detail ? `${code}:${detail}` : code);
}

function loadSourceLock(runtimeRoot: string): ReadonlyMap<string, SourceLockEntry> {
  const lockPath = path.resolve(runtimeRoot, "..", "SOURCE_LOCK.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(lockPath, "utf8")) as unknown;
  } catch (error) {
    throw resolverError("FREEFORM_CANONICAL_SOURCE_LOCK_UNAVAILABLE", String(error));
  }
  if (!isSchemaRecord(parsed) || !Array.isArray(parsed.files))
    throw resolverError("FREEFORM_CANONICAL_SOURCE_LOCK_INVALID");
  const entries = new Map<string, SourceLockEntry>();
  for (const entry of parsed.files) {
    if (
      !isSchemaRecord(entry) ||
      typeof entry.path !== "string" ||
      typeof entry.bytes !== "number" ||
      !Number.isInteger(entry.bytes) ||
      typeof entry.sha256 !== "string"
    )
      throw resolverError("FREEFORM_CANONICAL_SOURCE_LOCK_INVALID");
    entries.set(entry.path, {
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    });
  }
  return entries;
}

function decodeJsonPointerToken(token: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(token);
  } catch {
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  }
  if (/~(?![01])/.test(decoded)) throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  return decoded.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseJsonPointer(fragment: string): readonly string[] {
  if (!fragment) return [];
  if (!fragment.startsWith("/")) throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  return fragment.slice(1).split("/").map(decodeJsonPointerToken);
}

function readPointer(root: unknown, tokens: readonly string[]): unknown {
  let current: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^0$|^[1-9][0-9]*$/.test(token)) return undefined;
      const index = Number(token);
      if (index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isSchemaRecord(current) || !Object.prototype.hasOwnProperty.call(current, token))
      return undefined;
    current = current[token];
  }
  return current;
}

function externalReference(ref: string): {
  readonly uri: string;
  readonly relativePath: string;
  readonly tokens: readonly string[];
} {
  if (ref.includes("\\")) throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  let parsed: URL;
  try {
    parsed = new URL(ref);
  } catch {
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  }
  if (parsed.origin !== "https://kbr.local" || parsed.username || parsed.password || parsed.search)
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  }
  if (!pathname.startsWith("/schema/") || pathname.includes("\\"))
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  const relativePath = pathname.slice("/schema/".length);
  if (!relativePath || relativePath.includes("/") || relativePath === "." || relativePath === "..")
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  const uri = `https://kbr.local${pathname}`;
  return {
    uri,
    relativePath: `packages/renderer-contract/schema/${relativePath}`,
    tokens: parseJsonPointer(parsed.hash.slice(1)),
  };
}

function readLockedSchemaDocument(
  state: ResolverState,
  uri: string,
  relativePath: string,
): SchemaDocument {
  const existing = state.documents.get(uri);
  if (existing) return existing;
  const lockEntry = state.sourceLock.get(relativePath);
  if (!lockEntry) throw resolverError("FREEFORM_CANONICAL_SOURCE_LOCK_ENTRY_MISSING", relativePath);
  const filePath = path.resolve(state.runtimeRoot, relativePath);
  if (path.dirname(filePath) !== state.schemaDirectory)
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED");
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch {
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNRESOLVED", relativePath);
  }
  const actualSha256 = sha256(bytes);
  if (bytes.length !== lockEntry.bytes || actualSha256 !== lockEntry.sha256)
    throw resolverError(
      "FREEFORM_CANONICAL_SOURCE_LOCK_IDENTITY_FAILURE",
      `${relativePath}:${actualSha256}`,
    );
  let root: unknown;
  try {
    root = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNRESOLVED", String(error));
  }
  if (!isSchemaRecord(root))
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNRESOLVED", relativePath);
  if (root.$id !== undefined && root.$id !== uri)
    throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_DOCUMENT_ID_MISMATCH", relativePath);
  const document = { uri, root } as const;
  state.documents.set(uri, document);
  return document;
}

function resolveSchemaNode(
  node: unknown,
  document: SchemaDocument,
  pointer: readonly string[],
  state: ResolverState,
): unknown {
  if (Array.isArray(node))
    return node.map((child, index) =>
      resolveSchemaNode(child, document, pointer.concat(String(index)), state),
    );
  if (!isSchemaRecord(node)) return node;
  if (typeof node.$ref === "string") {
    if (Object.keys(node).length !== 1)
      throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_SIBLING_UNSUPPORTED");
    const ref = node.$ref;
    let targetDocument = document;
    let tokens: readonly string[];
    let relativePath: string | undefined;
    if (ref.startsWith("#")) tokens = parseJsonPointer(ref.slice(1));
    else {
      const external = externalReference(ref);
      targetDocument = readLockedSchemaDocument(state, external.uri, external.relativePath);
      tokens = external.tokens;
      relativePath = external.relativePath;
    }
    const referenceKey = `${targetDocument.uri}|${tokens.join("/")}`;
    const cached = state.resolvedReferences.get(referenceKey);
    if (cached !== undefined) return cached;
    if (state.activeReferences.has(referenceKey))
      throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_CYCLE", ref);
    const target = readPointer(targetDocument.root, tokens);
    if (target === undefined)
      throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNRESOLVED", relativePath ?? ref);
    state.activeReferences.add(referenceKey);
    try {
      const resolved = resolveSchemaNode(target, targetDocument, tokens, state);
      state.resolvedReferences.set(referenceKey, resolved);
      return resolved;
    } finally {
      state.activeReferences.delete(referenceKey);
    }
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      resolveSchemaNode(value, document, pointer.concat(key), state),
    ]),
  );
}

/**
 * Resolves the frozen renderer schema graph into a local, ref-free semantic
 * projection. The raw canonical loader remains the authority and is invoked
 * first so its exact hash/version guard cannot be bypassed.
 */
export function loadResolvedCanonicalCreativeLayoutPlanSchema(
  rendererRuntimeRoot = defaultRendererRuntimeRoot(),
): CanonicalFreeformLayoutPlanSchema {
  const raw = loadCanonicalCreativeLayoutPlanSchema(rendererRuntimeRoot);
  const root = raw as SchemaRecord;
  const rootUri =
    typeof root.$id === "string"
      ? root.$id
      : "https://kbr.local/schema/creative-layout-plan-v1.schema.json";
  const state: ResolverState = {
    runtimeRoot: rendererRuntimeRoot,
    schemaDirectory: path.resolve(rendererRuntimeRoot, "packages/renderer-contract/schema"),
    sourceLock: loadSourceLock(rendererRuntimeRoot),
    documents: new Map([[rootUri, { uri: rootUri, root }]]),
    resolvedReferences: new Map(),
    activeReferences: new Set(),
  };
  const resolved = resolveSchemaNode(root, { uri: rootUri, root }, [], state);
  if (!isSchemaRecord(resolved)) throw resolverError("FREEFORM_CANONICAL_SCHEMA_REF_UNRESOLVED");
  return resolved as CanonicalFreeformLayoutPlanSchema;
}

export function loadCanonicalCreativeLayoutPlanSchema(
  rendererRuntimeRoot = defaultRendererRuntimeRoot(),
): CanonicalFreeformLayoutPlanSchema {
  const bytes = readFileSync(path.join(rendererRuntimeRoot, FREEFORM_CANONICAL_SCHEMA_PATH));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== FREEFORM_CANONICAL_SCHEMA_SHA256)
    throw new Error(`FREEFORM_CANONICAL_SCHEMA_HASH_MISMATCH:${actualSha256}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error("FREEFORM_CANONICAL_SCHEMA_JSON_INVALID", { cause: error });
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as { properties?: { schemaVersion?: { const?: unknown } } }).properties?.schemaVersion
      ?.const !== FREEFORM_CANONICAL_SCHEMA_VERSION
  )
    throw new Error("FREEFORM_CANONICAL_SCHEMA_VERSION_MISMATCH");
  return parsed as CanonicalFreeformLayoutPlanSchema;
}

export function loadFreeformFormatProfileRegistry(
  rendererRuntimeRoot = defaultRendererRuntimeRoot(),
): FreeformFormatProfileRegistry {
  const registry = readJsonFile<FreeformFormatProfileRegistry>(
    rendererRuntimeRoot,
    FREEFORM_FORMAT_PROFILE_REGISTRY_PATH,
    FREEFORM_FORMAT_PROFILE_REGISTRY_SHA256,
  );
  if (registry.layoutMode !== "FREEFORM" || !Array.isArray(registry.profiles))
    throw new Error("FREEFORM_FORMAT_PROFILE_REGISTRY_INVALID");
  return registry;
}

export function loadFreeformFontRegistry(
  rendererRuntimeRoot = defaultRendererRuntimeRoot(),
): FreeformFontRegistry {
  const registry = readJsonFile<FreeformFontRegistry>(
    rendererRuntimeRoot,
    FREEFORM_FONT_REGISTRY_PATH,
    FREEFORM_FONT_REGISTRY_SHA256,
  );
  if (registry.fallbackAllowed !== false || !Array.isArray(registry.entries))
    throw new Error("FREEFORM_FONT_REGISTRY_INVALID");
  return registry;
}
