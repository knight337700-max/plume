import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PathSecurityError, resolveTrustedInputFile, resolveTrustedRoot } from "./path-security.js";

export const NAVER_SMARTCHANNEL_FONT_ERROR_CODES = {
  unavailable: "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE",
  identityMismatch: "NAVER_SMARTCHANNEL_FONT_IDENTITY_MISMATCH",
  versionMismatch: "NAVER_SMARTCHANNEL_FONT_VERSION_MISMATCH",
  resourceMissing: "FONT_RESOURCE_MISSING",
  resourceShaMismatch: "FONT_RESOURCE_SHA_MISMATCH",
  collectionFaceNotFound: "FONT_COLLECTION_FACE_NOT_FOUND",
  collectionFaceIdentityMismatch: "FONT_COLLECTION_FACE_IDENTITY_MISMATCH",
  collectionUnsupported: "FONT_COLLECTION_UNSUPPORTED",
  derivedProvenanceMismatch: "FONT_DERIVED_RESOURCE_PROVENANCE_MISMATCH",
} as const;

export type NaverSmartChannelFontErrorCode =
  (typeof NAVER_SMARTCHANNEL_FONT_ERROR_CODES)[keyof typeof NAVER_SMARTCHANNEL_FONT_ERROR_CODES];

/** Runtime resolution is intentionally limited to renderer-owned exact resources. */
export type SmartChannelFontResolutionMode = "BUNDLED_EXACT" | "EXTERNAL_EXACT";

export type SmartChannelFontRequirement = {
  requiredPostScriptName: string;
  /** Source PSD identity; runtime matching uses runtimePostScriptName when present. */
  sourcePostScriptName?: string;
  runtimePostScriptName?: string;
  /** Physical binary identities accepted for a pinned renderer resource. */
  identityPostScriptNames?: readonly string[];
  fontToken?: string;
  sourceIdentityStatus?: "SOURCE_EXACT" | "SOURCE_DIFFERENT_BUILD";
  compatibilityStatus?: "PSD_EXACT_RENDERER_OWNED" | "PROJECT_COMPATIBLE_VERIFIED" | "PROJECT_COMPATIBLE_UNVERIFIED" | "INCOMPATIBLE";
  allowedResolutionModes: readonly SmartChannelFontResolutionMode[];
  expectedSha256?: string;
  expectedVersion?: string;
};

export type ExternalExactFontResource = {
  path: string;
  expectedPostScriptName: string;
  expectedSha256: string;
  expectedVersion?: string;
};

export type ParsedFontIdentity = {
  postScriptNames: string[];
  familyNames: string[];
  subfamilyNames: string[];
  versions: string[];
  weightClass: number | null;
};

export type FontGlyphCoverage = {
  requiredCodePoints: number[];
  missingCodePoints: number[];
  covered: boolean;
};

export type FontCollectionFace = ParsedFontIdentity & {
  index: number;
  offset: number;
  unitsPerEm: number | null;
  glyphCount: number | null;
  outlineFormat: "CFF" | "CFF2" | "GLYF" | "UNKNOWN";
  tableTags: string[];
};

export type FontCollectionInventory = {
  format: "TTC";
  faceCount: number;
  faces: FontCollectionFace[];
};

export type FontResourceKind = "SINGLE_FONT" | "FONT_COLLECTION" | "DERIVED_STANDALONE_FACE";

export type SmartChannelFontResourceRequest = {
  token: string;
  assetId?: string;
  kind?: FontResourceKind;
  relativePath: string;
  expectedSha256: string;
  expectedPostScriptName: string;
  face?: { index: number; postScriptName: string; version?: string };
};

export type SmartChannelFontResourceResolution = {
  path: string;
  providerId: string;
  resolutionMode: "BUNDLED_EXACT" | "EXTERNAL_EXACT";
  environmentIndependent: true;
};

export type SmartChannelFontResourceProvider = {
  id: string;
  resolutionMode: "BUNDLED_EXACT" | "EXTERNAL_EXACT";
  environmentIndependent: true;
  resolve(request: SmartChannelFontResourceRequest): Promise<SmartChannelFontResourceResolution | null>;
};

export type FontPreflightIssue = {
  code: NaverSmartChannelFontErrorCode;
  messageKey: string;
  path: string;
  expected?: unknown;
  actual?: unknown;
};

export type FontPreflightResult = {
  status: "PASS" | "BLOCKED";
  renderStartAllowed: boolean;
  requiredPostScriptName: string;
  resolutionMode: SmartChannelFontResolutionMode;
  issues: FontPreflightIssue[];
  resolvedPath?: string;
  digest?: string;
  identity?: ParsedFontIdentity;
  fontToken?: string;
  sourceIdentityStatus?: "SOURCE_EXACT" | "SOURCE_DIFFERENT_BUILD";
  compatibilityStatus?: "PSD_EXACT_RENDERER_OWNED" | "PROJECT_COMPATIBLE_VERIFIED" | "PROJECT_COMPATIBLE_UNVERIFIED" | "INCOMPATIBLE";
};

type TableRecord = { tag: string; offset: number; length: number };

function readUInt16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  const first = bytes[offset];
  const second = bytes[offset + 1];
  return first === undefined || second === undefined ? null : (first << 8) | second;
}

function readUInt32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  const first = bytes[offset];
  const second = bytes[offset + 1];
  const third = bytes[offset + 2];
  const fourth = bytes[offset + 3];
  return first === undefined || second === undefined || third === undefined || fourth === undefined
    ? null
    : (first * 0x1000000) + (second << 16) + (third << 8) + fourth;
}

function readInt16(bytes: Uint8Array, offset: number): number | null {
  const value = readUInt16(bytes, offset);
  if (value === null) return null;
  return value & 0x8000 ? value - 0x10000 : value;
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    if (first === undefined || second === undefined) continue;
    value += String.fromCharCode((first << 8) | second);
  }
  return value.replaceAll("\u0000", "").trim();
}

function decodeNameBytes(bytes: Uint8Array, platformId: number): string {
  if (platformId === 0 || platformId === 3) return decodeUtf16Be(bytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replaceAll("\u0000", "").trim();
}

function nameValue(values: Map<number, Set<string>>, nameId: number): string[] {
  return [...(values.get(nameId) ?? new Set<string>())].filter(Boolean).sort();
}

function tableDirectory(bytes: Uint8Array, sfntOffset = 0): Map<string, TableRecord> | null {
  const signature = new TextDecoder("latin1").decode(bytes.subarray(sfntOffset, sfntOffset + 4));
  if (!(signature === "OTTO" || signature === "true" || signature === "typ1" || signature === "\u0000\u0001\u0000\u0000")) return null;
  const tableCount = readUInt16(bytes, sfntOffset + 4);
  if (tableCount === null || tableCount > 4096) return null;
  const tables = new Map<string, TableRecord>();
  for (let index = 0; index < tableCount; index += 1) {
    const rowOffset = sfntOffset + 12 + (index * 16);
    if (rowOffset + 16 > bytes.length) return null;
    const tag = new TextDecoder("latin1").decode(bytes.subarray(rowOffset, rowOffset + 4));
    const offset = readUInt32(bytes, rowOffset + 8);
    const length = readUInt32(bytes, rowOffset + 12);
    if (offset === null || length === null || offset + length > bytes.length) return null;
    tables.set(tag, { tag, offset, length });
  }
  return tables;
}

export function inspectFontIdentity(bytes: Uint8Array): ParsedFontIdentity | null {
  return inspectFontIdentityAtOffset(bytes, 0);
}

function inspectFontIdentityAtOffset(bytes: Uint8Array, sfntOffset: number): ParsedFontIdentity | null {
  const tables = tableDirectory(bytes, sfntOffset);
  const nameTable = tables?.get("name");
  if (!tables || !nameTable) return null;
  const format = readUInt16(bytes, nameTable.offset);
  const count = readUInt16(bytes, nameTable.offset + 2);
  const stringOffset = readUInt16(bytes, nameTable.offset + 4);
  if (format === null || count === null || stringOffset === null || count > 4096) return null;
  const values = new Map<number, Set<string>>();
  for (let index = 0; index < count; index += 1) {
    const recordOffset = nameTable.offset + 6 + (index * 12);
    const platformId = readUInt16(bytes, recordOffset);
    const nameId = readUInt16(bytes, recordOffset + 6);
    const length = readUInt16(bytes, recordOffset + 8);
    const valueOffset = readUInt16(bytes, recordOffset + 10);
    if (platformId === null || nameId === null || length === null || valueOffset === null) return null;
    const start = nameTable.offset + stringOffset + valueOffset;
    if (start + length > nameTable.offset + nameTable.length) return null;
    const value = decodeNameBytes(bytes.subarray(start, start + length), platformId);
    if (!value) continue;
    const set = values.get(nameId) ?? new Set<string>();
    set.add(value);
    values.set(nameId, set);
  }
  const postScriptNames = nameValue(values, 6);
  if (postScriptNames.length === 0) return null;
  const os2 = tables.get("OS/2");
  const weightClass = os2 && os2.length >= 6 ? readUInt16(bytes, os2.offset + 4) : null;
  return {
    postScriptNames,
    familyNames: nameValue(values, 1),
    subfamilyNames: nameValue(values, 2),
    versions: nameValue(values, 5),
    weightClass,
  };
}

export function inspectFontCollection(bytes: Uint8Array): FontCollectionInventory | null {
  const signature = new TextDecoder("latin1").decode(bytes.subarray(0, 4));
  if (signature !== "ttcf") return null;
  const faceCount = readUInt32(bytes, 8);
  if (faceCount === null || faceCount < 1 || faceCount > 4096 || 12 + (faceCount * 4) > bytes.length) return null;
  const faces: FontCollectionFace[] = [];
  for (let index = 0; index < faceCount; index += 1) {
    const offset = readUInt32(bytes, 12 + (index * 4));
    if (offset === null) return null;
    const identity = inspectFontIdentityAtOffset(bytes, offset);
    const tables = tableDirectory(bytes, offset);
    if (!identity || !tables) return null;
    const head = tables.get("head");
    const maxp = tables.get("maxp");
    faces.push({
      ...identity,
      index,
      offset,
      unitsPerEm: head && head.length >= 20 ? readUInt16(bytes, head.offset + 18) : null,
      glyphCount: maxp && maxp.length >= 6 ? readUInt16(bytes, maxp.offset + 4) : null,
      outlineFormat: tables.has("CFF2") ? "CFF2" : tables.has("CFF ") ? "CFF" : tables.has("glyf") ? "GLYF" : "UNKNOWN",
      tableTags: [...tables.keys()].sort(),
    });
  }
  return { format: "TTC", faceCount, faces };
}

function cmapSubtables(bytes: Uint8Array, table: TableRecord): Array<{ format: number; offset: number; length: number }> {
  const version = readUInt16(bytes, table.offset);
  const count = readUInt16(bytes, table.offset + 2);
  if (version === null || count === null || count > 128 || table.length < 4 + (count * 8)) return [];
  const result: Array<{ format: number; offset: number; length: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const record = table.offset + 4 + (index * 8);
    const subtableOffset = readUInt32(bytes, record + 4);
    if (subtableOffset === null || subtableOffset >= table.length) continue;
    const offset = table.offset + subtableOffset;
    const format = readUInt16(bytes, offset);
    if (format === null) continue;
    const length = format === 12 ? readUInt32(bytes, offset + 4) : readUInt16(bytes, offset + 2);
    if (length === null || offset + length > table.offset + table.length) continue;
    result.push({ format, offset, length });
  }
  return result.sort((left, right) => (right.format === 12 ? 1 : 0) - (left.format === 12 ? 1 : 0));
}

function cmapHasCodePoint(bytes: Uint8Array, subtable: { format: number; offset: number; length: number }, codePoint: number): boolean {
  if (subtable.format === 12) {
    const groupCount = readUInt32(bytes, subtable.offset + 12);
    if (groupCount === null || groupCount > 1_000_000) return false;
    let low = 0;
    let high = groupCount - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const row = subtable.offset + 16 + (middle * 12);
      const start = readUInt32(bytes, row);
      const end = readUInt32(bytes, row + 4);
      if (start === null || end === null) return false;
      if (codePoint < start) high = middle - 1;
      else if (codePoint > end) low = middle + 1;
      else return true;
    }
    return false;
  }
  if (subtable.format !== 4 || codePoint > 0xffff) return false;
  const segmentCountX2 = readUInt16(bytes, subtable.offset + 6);
  if (segmentCountX2 === null || segmentCountX2 % 2 !== 0) return false;
  const segmentCount = segmentCountX2 / 2;
  const endCodes = subtable.offset + 14;
  const startCodes = endCodes + segmentCountX2 + 2;
  const idDeltas = startCodes + segmentCountX2;
  const idRangeOffsets = idDeltas + segmentCountX2;
  let segment = -1;
  for (let index = 0; index < segmentCount; index += 1) {
    const end = readUInt16(bytes, endCodes + (index * 2));
    if (end !== null && codePoint <= end) {
      segment = index;
      break;
    }
  }
  if (segment < 0) return false;
  const start = readUInt16(bytes, startCodes + (segment * 2));
  if (start === null || codePoint < start) return false;
  const rangeOffset = readUInt16(bytes, idRangeOffsets + (segment * 2));
  const delta = readInt16(bytes, idDeltas + (segment * 2));
  if (rangeOffset === null || delta === null) return false;
  if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0;
  const glyphOffset = idRangeOffsets + (segment * 2) + rangeOffset + ((codePoint - start) * 2);
  const glyph = readUInt16(bytes, glyphOffset);
  return glyph !== null && glyph !== 0;
}

export function inspectFontGlyphCoverage(bytes: Uint8Array, text: string): FontGlyphCoverage {
  return inspectFontGlyphCoverageAtOffset(bytes, text, 0);
}

export function inspectFontCollectionFaceGlyphCoverage(bytes: Uint8Array, faceIndex: number, text: string): FontGlyphCoverage {
  const face = inspectFontCollection(bytes)?.faces[faceIndex];
  if (!face) return { requiredCodePoints: [], missingCodePoints: [], covered: false };
  return inspectFontGlyphCoverageAtOffset(bytes, text, face.offset);
}

function inspectFontGlyphCoverageAtOffset(bytes: Uint8Array, text: string, sfntOffset: number): FontGlyphCoverage {
  const requiredCodePoints = [...new Set([...text.normalize("NFC")].map((character) => character.codePointAt(0)).filter((value): value is number => value !== undefined))].sort((left, right) => left - right);
  const cmap = tableDirectory(bytes, sfntOffset)?.get("cmap");
  const subtables = cmap ? cmapSubtables(bytes, cmap) : [];
  const missingCodePoints = requiredCodePoints.filter((codePoint) => !subtables.some((subtable) => cmapHasCodePoint(bytes, subtable, codePoint)));
  return { requiredCodePoints, missingCodePoints, covered: missingCodePoints.length === 0 };
}

export type FontTableEquivalence = {
  tag: string;
  status: "IDENTICAL" | "SEMANTICALLY_IDENTICAL_CHECKSUM_ADJUSTMENT_ONLY" | "MISSING" | "MISMATCH";
  sourceSha256?: string;
  derivedSha256?: string;
};

function normalizedTableBytes(bytes: Uint8Array, table: TableRecord): Buffer {
  const value = Buffer.from(bytes.subarray(table.offset, table.offset + table.length));
  if (table.tag === "head" && value.length >= 12) value.writeUInt32BE(0, 8);
  return value;
}

export function compareFontCollectionFaceToStandalone(collectionBytes: Uint8Array, faceIndex: number, standaloneBytes: Uint8Array): FontTableEquivalence[] | null {
  const face = inspectFontCollection(collectionBytes)?.faces[faceIndex];
  const sourceTables = face ? tableDirectory(collectionBytes, face.offset) : null;
  const derivedTables = tableDirectory(standaloneBytes);
  if (!face || !sourceTables || !derivedTables) return null;
  const tags = [...new Set([...sourceTables.keys(), ...derivedTables.keys()])].sort();
  return tags.map((tag) => {
    const source = sourceTables.get(tag);
    const derived = derivedTables.get(tag);
    if (!source || !derived) return { tag, status: "MISSING" as const };
    const sourceBytes = normalizedTableBytes(collectionBytes, source);
    const derivedBytes = normalizedTableBytes(standaloneBytes, derived);
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const derivedSha256 = createHash("sha256").update(derivedBytes).digest("hex");
    return {
      tag,
      status: sourceSha256 === derivedSha256
        ? tag === "head" ? "SEMANTICALLY_IDENTICAL_CHECKSUM_ADJUSTMENT_ONLY" as const : "IDENTICAL" as const
        : "MISMATCH" as const,
      sourceSha256,
      derivedSha256,
    };
  });
}

function issue(
  code: NaverSmartChannelFontErrorCode,
  messageKey: string,
  expected?: unknown,
  actual?: unknown,
  pathValue = "/font",
): FontPreflightIssue {
  const result: FontPreflightIssue = { code, messageKey, path: pathValue };
  if (expected !== undefined) result.expected = expected;
  if (actual !== undefined) result.actual = actual;
  return result;
}

function passedResult(
  requirement: SmartChannelFontRequirement,
  resolutionMode: SmartChannelFontResolutionMode,
  details: { resolvedPath?: string; digest?: string; identity?: ParsedFontIdentity },
): FontPreflightResult {
  const result: FontPreflightResult = {
    status: "PASS",
    renderStartAllowed: true,
    requiredPostScriptName: requirement.requiredPostScriptName,
    resolutionMode,
    issues: [],
  };
  if (requirement.fontToken !== undefined) result.fontToken = requirement.fontToken;
  if (requirement.sourceIdentityStatus !== undefined) result.sourceIdentityStatus = requirement.sourceIdentityStatus;
  if (requirement.compatibilityStatus !== undefined) result.compatibilityStatus = requirement.compatibilityStatus;
  if (details.resolvedPath !== undefined) result.resolvedPath = details.resolvedPath;
  if (details.digest !== undefined) result.digest = details.digest;
  if (details.identity !== undefined) result.identity = details.identity;
  return result;
}

function blockedResult(
  requirement: SmartChannelFontRequirement,
  resolutionMode: SmartChannelFontResolutionMode,
  issues: FontPreflightIssue[],
  details: { resolvedPath?: string; digest?: string; identity?: ParsedFontIdentity } = {},
): FontPreflightResult {
  const result: FontPreflightResult = {
    status: "BLOCKED",
    renderStartAllowed: false,
    requiredPostScriptName: requirement.requiredPostScriptName,
    resolutionMode,
    issues,
  };
  if (requirement.fontToken !== undefined) result.fontToken = requirement.fontToken;
  if (requirement.sourceIdentityStatus !== undefined) result.sourceIdentityStatus = requirement.sourceIdentityStatus;
  if (requirement.compatibilityStatus !== undefined) result.compatibilityStatus = requirement.compatibilityStatus;
  if (details.resolvedPath !== undefined) result.resolvedPath = details.resolvedPath;
  if (details.digest !== undefined) result.digest = details.digest;
  if (details.identity !== undefined) result.identity = details.identity;
  return result;
}

export function evaluateFontIdentity(
  requirement: SmartChannelFontRequirement,
  resolutionMode: SmartChannelFontResolutionMode,
  actual: { postScriptNames: readonly string[]; digest: string; versions?: readonly string[] },
): FontPreflightResult {
  const issues: FontPreflightIssue[] = [];
  const runtimePostScriptName = requirement.runtimePostScriptName ?? requirement.requiredPostScriptName;
  if (!requirement.allowedResolutionModes.includes(resolutionMode)) {
    issues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      requirement.allowedResolutionModes,
      resolutionMode,
      "/font/resolutionMode",
    ));
  }
  const acceptedPostScriptNames = requirement.identityPostScriptNames?.length
    ? requirement.identityPostScriptNames
    : [runtimePostScriptName];
  if (!acceptedPostScriptNames.some((name) => actual.postScriptNames.includes(name))) {
    issues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.identityMismatch,
      "naver_smartchannel.font_identity_mismatch",
      acceptedPostScriptNames,
      actual.postScriptNames,
      "/font/postScriptName",
    ));
  }
  if (requirement.expectedSha256 !== undefined && actual.digest.toLowerCase() !== requirement.expectedSha256.toLowerCase()) {
    issues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.identityMismatch,
      "naver_smartchannel.font_digest_mismatch",
      requirement.expectedSha256.toLowerCase(),
      actual.digest.toLowerCase(),
      "/font/sha256",
    ));
  }
  if (requirement.expectedVersion !== undefined && !(actual.versions ?? []).includes(requirement.expectedVersion)) {
    issues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.versionMismatch,
      "naver_smartchannel.font_version_mismatch",
      requirement.expectedVersion,
      actual.versions ?? [],
      "/font/version",
    ));
  }
  return issues.length === 0
    ? passedResult(requirement, resolutionMode, { digest: actual.digest })
    : blockedResult(requirement, resolutionMode, issues, { digest: actual.digest });
}

async function preflightExactFont(
  requirement: SmartChannelFontRequirement,
  resource: ExternalExactFontResource,
  options: { trustedRoot: string },
  resolutionMode: "BUNDLED_EXACT" | "EXTERNAL_EXACT",
): Promise<FontPreflightResult> {
  if (!requirement.allowedResolutionModes.includes(resolutionMode)) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      `${resolutionMode} resolution mode`,
      requirement.allowedResolutionModes,
      "/font/resolutionMode",
    )]);
  }
  let trustedRoot: string;
  let resolvedPath: string;
  try {
    if (/^[a-z][a-z\d+.-]*:/iu.test(resource.path) || /^[a-z]:/iu.test(resource.path)) {
      throw new PathSecurityError("External font reference must be a trusted-root relative path", resource.path);
    }
    trustedRoot = await resolveTrustedRoot(options.trustedRoot);
    resolvedPath = await resolveTrustedInputFile(trustedRoot, resource.path);
  } catch (error) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      "trusted local exact font resource",
      error instanceof Error ? error.message : String(error),
      "/font/path",
    )]);
  }

  const declarationIssues: FontPreflightIssue[] = [];
  const runtimePostScriptName = requirement.runtimePostScriptName ?? requirement.requiredPostScriptName;
  if (resource.expectedPostScriptName !== runtimePostScriptName) {
    declarationIssues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.identityMismatch,
      "naver_smartchannel.font_identity_mismatch",
      runtimePostScriptName,
      resource.expectedPostScriptName,
      "/font/expectedPostScriptName",
    ));
  }
  if (requirement.expectedSha256 !== undefined && resource.expectedSha256.toLowerCase() !== requirement.expectedSha256.toLowerCase()) {
    declarationIssues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.identityMismatch,
      "naver_smartchannel.font_digest_mismatch",
      requirement.expectedSha256.toLowerCase(),
      resource.expectedSha256.toLowerCase(),
      "/font/expectedSha256",
    ));
  }
  if (requirement.expectedVersion !== undefined && resource.expectedVersion !== requirement.expectedVersion) {
    declarationIssues.push(issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.versionMismatch,
      "naver_smartchannel.font_version_mismatch",
      requirement.expectedVersion,
      resource.expectedVersion,
      "/font/expectedVersion",
    ));
  }
  if (declarationIssues.length > 0) return blockedResult(requirement, resolutionMode, declarationIssues, { resolvedPath });

  let bytes: Buffer;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      resolvedPath,
      error instanceof Error ? error.message : String(error),
      "/font/path",
    )], { resolvedPath });
  }
  const identity = inspectFontIdentity(bytes);
  if (identity === null) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      "decodable OpenType font",
      "undecodable or unsupported font binary",
      "/font/file",
    )], { resolvedPath });
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const effectiveRequirement: SmartChannelFontRequirement = { ...requirement };
  if (requirement.expectedSha256 === undefined) effectiveRequirement.expectedSha256 = resource.expectedSha256;
  if (requirement.expectedVersion === undefined && resource.expectedVersion !== undefined) effectiveRequirement.expectedVersion = resource.expectedVersion;
  const result = evaluateFontIdentity(effectiveRequirement, resolutionMode, {
    postScriptNames: identity.postScriptNames,
    digest,
    versions: identity.versions,
  });
  result.resolvedPath = resolvedPath;
  result.identity = identity;
  return result;
}

export async function preflightBundledExactFont(
  requirement: SmartChannelFontRequirement,
  resource: ExternalExactFontResource,
  options: { trustedRoot: string },
): Promise<FontPreflightResult> {
  return preflightExactFont(requirement, resource, options, "BUNDLED_EXACT");
}

export async function preflightExternalExactFont(
  requirement: SmartChannelFontRequirement,
  resource: ExternalExactFontResource,
  options: { trustedRoot: string },
): Promise<FontPreflightResult> {
  return preflightExactFont(requirement, resource, options, "EXTERNAL_EXACT");
}

export async function preflightResolvedExactFont(
  requirement: SmartChannelFontRequirement,
  resolvedPath: string,
  resolutionMode: "BUNDLED_EXACT" | "EXTERNAL_EXACT",
): Promise<FontPreflightResult> {
  let bytes: Buffer;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      "trusted local exact font resource",
      error instanceof Error ? error.message : String(error),
      "/font/file",
    )], { resolvedPath });
  }
  const identity = inspectFontIdentity(bytes);
  if (!identity) {
    return blockedResult(requirement, resolutionMode, [issue(
      NAVER_SMARTCHANNEL_FONT_ERROR_CODES.unavailable,
      "naver_smartchannel.font_unavailable",
      "decodable OpenType font",
      "undecodable or unsupported font binary",
      "/font/file",
    )], { resolvedPath });
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const result = evaluateFontIdentity(requirement, resolutionMode, {
    postScriptNames: identity.postScriptNames,
    digest,
    versions: identity.versions,
  });
  result.resolvedPath = resolvedPath;
  result.identity = identity;
  return result;
}

export function createSmartChannelFontResourceProvider(options: {
  root: string;
  id: string;
  resolutionMode?: "BUNDLED_EXACT" | "EXTERNAL_EXACT";
}): SmartChannelFontResourceProvider {
  const resolutionMode = options.resolutionMode ?? "BUNDLED_EXACT";
  return {
    id: options.id,
    resolutionMode,
    environmentIndependent: true,
    async resolve(request) {
      if (!isTrustedFontReference(request.relativePath)) return null;
      try {
        const trustedRoot = await resolveTrustedRoot(options.root);
        const resolved = await resolveTrustedInputFile(trustedRoot, request.relativePath);
        return { path: resolved, providerId: options.id, resolutionMode, environmentIndependent: true };
      } catch {
        return null;
      }
    },
  };
}

export function assertSmartChannelFallbackProhibited(fallbackAllowed: boolean): void {
  if (fallbackAllowed) throw new Error("SmartChannel strict Template Locked resolution forbids fallback");
}

export function isTrustedFontReference(reference: string): boolean {
  if (reference.length === 0 || reference.includes("\0") || path.posix.isAbsolute(reference) || path.win32.isAbsolute(reference)) return false;
  if (/^[a-z][a-z\d+.-]*:/iu.test(reference) || /^[a-z]:/iu.test(reference)) return false;
  const normalized = reference.replaceAll("\\", "/");
  return !normalized.split("/").includes("..");
}
