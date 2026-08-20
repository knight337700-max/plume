import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas, GlobalFonts, ImageData, type Canvas } from "@napi-rs/canvas";
import sharp from "sharp";

import type { ContractBundle } from "./contracts.js";
import { canonicalDigest, canonicalJson } from "./canonical.js";
import { createIssue, sortAndDedupeIssues, splitIssues } from "./errors.js";
import { sha256Bytes } from "./hash.js";
import { inspectImageFile } from "./image-input.js";
import {
  compareFontCollectionFaceToStandalone,
  evaluateFontIdentity,
  createSmartChannelFontResourceProvider,
  inspectFontCollection,
  inspectFontCollectionFaceGlyphCoverage,
  inspectFontGlyphCoverage,
  inspectFontIdentity,
  preflightResolvedExactFont,
  type SmartChannelFontResourceProvider,
  type SmartChannelFontRequirement,
} from "./naver-smartchannel-font-preflight.js";
import { PathSecurityError, resolveTrustedInputFile, resolveTrustedJobDirectory } from "./path-security.js";
import { publishArtifacts, PublishError } from "./publish.js";
import { inspectPngIhdr } from "./raster.js";
import { SchemaValidators } from "./schema-validation.js";
import type {
  BBox,
  RenderManifest,
  RenderResponse,
  SmartChannelReport,
  SmartChannelTextRoleReport,
  ValidationIssue,
} from "./types.js";

export const NAVER_SMARTCHANNEL_FORMAT_PROFILE_ID = "NAVER_GFA_SMARTCHANNEL";
export const NAVER_SMARTCHANNEL_CANVAS_WIDTH = 750;
export const NAVER_SMARTCHANNEL_HEIGHTS = [160, 200, 280] as const;
export const NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH = 260;
export const NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT = 160;
export const NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS = 29120;
export const NAVER_SMARTCHANNEL_TRIM_PRESERVE_THRESHOLD = 1;
export const NAVER_SMARTCHANNEL_LAYOUT_VISIBLE_THRESHOLD = 8;
export const NAVER_SMARTCHANNEL_MAX_UPSCALE = 1.5;
// Meaningful disconnected glyphs (for example a logo made of several
// separated letters) are retained; only genuinely tiny isolated noise is
// excluded from the visible trim seed. The source RGBA bytes are untouched.
export const NAVER_SMARTCHANNEL_MIN_VISIBLE_COMPONENT_PIXELS = 16;
const NAVER_SMARTCHANNEL_PNG_ENCODER_VERSION = "napi-rs-canvas-png-v1";
const NAVER_SMARTCHANNEL_DIAGNOSTIC_RASTER_WIDTH = 1500;

type SmartChannelJson = Record<string, unknown>;
type SmartChannelAsset = { path: string; expectedSha256?: string | null };
type SmartChannelContent = {
  headline?: string;
  headlineLine2?: string;
  subcopy?: string;
  subcopyLine4?: string;
  disclosureLine1?: string;
  disclosureLine2?: string;
  ctaOption?: string;
};

export type SmartChannelRenderRequest = {
  schemaVersion?: "1.0.0";
  channel: "NAVER_GFA";
  placement: "SMARTCHANNEL";
  layoutMode?: "TEMPLATE_LOCKED";
  compositionMode?: "RENDERER_COMPOSED";
  artifactCardinality?: "SINGLE";
  templateId: string;
  content: SmartChannelContent;
  assets: { object: SmartChannelAsset; advertiserLogo?: SmartChannelAsset };
  output: { directory: string; baseName: string; overwrite?: boolean };
};

export type SmartChannelRenderOptions = {
  projectRoot: string;
  inputRoot: string;
  outputRoot: string;
  contracts: ContractBundle;
  publish?: boolean;
  /** Renderer-owned resource adapter. Physical paths never enter fingerprints. */
  fontResourceProvider?: SmartChannelFontResourceProvider;
};

export type SmartChannelRenderResult = RenderResponse & {
  png?: Buffer | null;
  report?: SmartChannelReport;
};

export type SmartChannelTextRasterDiagnostic = {
  templateId: string;
  canvas: { width: number; height: number };
  textRoles: SmartChannelTextRoleReport[];
};

export type SmartChannelTypographyRasterAlignmentAudit = {
  typographyTokenId: string;
  rows: Array<{
    templateId: string;
    role: NaverTextLayer["role"];
    sourceLayer: string;
    sourceText: string;
    sourcePixelBounds: number[];
    runtimeBoundsBefore: BBox | null;
    runtimeBoundsAfter: BBox | null;
    baselineDeltaY: number;
    topDeltaBefore: number | null;
    topDeltaAfter: number | null;
  }>;
};

type NaverTemplate = {
  templateId: string;
  height: number;
  family: string;
  objectKind: string;
  side: string;
  textVariant: string;
  affordance: string;
  objectPlacementToken: string;
};

type NaverPlacementToken = {
  token: string;
  runtimeEnabled: boolean;
  sourceAssetRuleId: string;
  coordinateSpace: { type: string; canvas?: { width: number; height: number }; width?: number; height?: number };
  placementFrame: { x: number; y?: number; width: number; height?: number };
  fitMode: string;
  placementPolicy: string;
  sourceFrame?: { width: number; height: number; canvasTransform?: number[] } | undefined;
};

type NaverTextLayer = {
  layerPath: string;
  name: string;
  visible?: boolean;
  role: "HEADLINE" | "SUBCOPY" | "DISCLOSURE" | "CTA_LABEL";
  fontNames: string[];
  styleRuns: Array<Record<string, string>>;
  textPlacement: { originX: number; baselineY: number; boxX: number; boxY: number; boxWidth: number; boxHeight: number };
  pixelBounds: number[];
  typographyTokenId?: string;
};

type ResolvedFont = {
  token: string;
  path: string;
  digest: string;
  runtimePostScriptName: string;
  collectionAssetId: string;
  collectionDigest: string;
  collectionFaceIndex: number;
  collectionFacePostScriptName: string;
  fontContractVersion: string;
  integrationMode: "VERIFIED_DERIVED_STANDALONE_FACE" | "LEGACY_N77_SINGLE_FONT";
};
export type DecodedRgba = { bytes: Buffer; width: number; height: number };

export type SmartChannelObjectDiagnostics = {
  sourceCanvas: { width: number; height: number };
  alphaBounds: BBox | null;
  normalizedSize: { width: number; height: number; scale: number };
  finalBounds: BBox | null;
  targetRegion: BBox;
  opaquePixelCount: number;
  maxOpaquePixelCount: number;
};

type SmartChannelObjectRaster = {
  image: DecodedRgba;
  destination: { x: number; y: number };
  finalBounds: BBox | null;
  diagnostics: SmartChannelObjectDiagnostics;
  legacyPrecomposed: boolean;
};

const registeredNaverFonts = new Set<string>();

function jsonObject(value: unknown): SmartChannelJson {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as SmartChannelJson : {};
}

function jsonArray(value: unknown): SmartChannelJson[] {
  return Array.isArray(value) ? value.filter((entry): entry is SmartChannelJson => entry !== null && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.normalize("NFC").trim() : undefined;
}

function failure(contracts: ContractBundle, issues: readonly ValidationIssue[], detail: { png?: Buffer | null; report?: SmartChannelReport } = {}): SmartChannelRenderResult {
  const sorted = sortAndDedupeIssues(issues);
  const { errors, warnings } = splitIssues(sorted);
  return {
    schemaVersion: "1.0.0",
    manifestDigest: null,
    pngDigest: null,
    manifestPath: null,
    pngPath: null,
    downloadAllowed: false,
    status: "FAIL",
    errors: errors.length > 0 ? errors : [createIssue(contracts.errorRegistry, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/")],
    warnings,
    formatProfileId: NAVER_SMARTCHANNEL_FORMAT_PROFILE_ID,
    png: detail.png ?? null,
    ...(detail.report ? { report: detail.report } : {}),
  };
}

function templates(contract: Record<string, unknown>): NaverTemplate[] {
  return jsonArray(contract.templates).map((entry) => ({
    templateId: String(entry.templateId),
    height: Number(entry.height),
    family: String(entry.family),
    objectKind: String(entry.objectKind),
    side: String(entry.side),
    textVariant: String(entry.textVariant),
    affordance: String(entry.affordance),
    objectPlacementToken: String(entry.objectPlacementToken),
  }));
}

function placementTokens(contract: Record<string, unknown>): NaverPlacementToken[] {
  return jsonArray(contract.tokens).map((entry) => ({
    token: String(entry.token),
    runtimeEnabled: entry.runtimeEnabled === true,
    sourceAssetRuleId: String(entry.sourceAssetRuleId),
    coordinateSpace: jsonObject(entry.coordinateSpace) as NaverPlacementToken["coordinateSpace"],
    placementFrame: jsonObject(entry.placementFrame) as unknown as NaverPlacementToken["placementFrame"],
    fitMode: String(entry.fitMode),
    placementPolicy: String(entry.placementPolicy),
    ...(entry.sourceFrame ? { sourceFrame: jsonObject(entry.sourceFrame) as unknown as NaverPlacementToken["sourceFrame"] } : {}),
  }));
}

function normalizedPlacementFrame(token: NaverPlacementToken, canvasHeight: number): BBox {
  const sourceFrame = token.placementFrame;
  const coordinateCanvas = token.coordinateSpace.canvas;
  const height = Number(sourceFrame.height ?? coordinateCanvas?.height ?? canvasHeight);
  return {
    x: Number(sourceFrame.x),
    y: Number(sourceFrame.y ?? 0),
    width: Number(sourceFrame.width),
    height,
  };
}

function issueFor(contracts: ContractBundle, code: string, pathValue: string, expected?: unknown, actual?: unknown, stage: "PRE_RENDER" | "POST_RENDER" = "PRE_RENDER"): ValidationIssue {
  return createIssue(contracts.errorRegistry, code, pathValue, { expected, actual, stage, formatProfileId: NAVER_SMARTCHANNEL_FORMAT_PROFILE_ID });
}

function parseFillColor(value: string | undefined): string {
  if (!value) throw new Error("Typography token has no FillColor");
  const match = value.match(/Values':\s*\[([^\]]+)/u);
  if (!match?.[1]) throw new Error("Typography token FillColor is not parseable");
  const values = match[1].split(",").map((item) => Number(item.trim()));
  const redValue = values[1];
  const greenValue = values[2];
  const blueValue = values[3];
  if (redValue === undefined || greenValue === undefined || blueValue === undefined || [redValue, greenValue, blueValue].some((item) => !Number.isFinite(item))) throw new Error("Typography token FillColor is incomplete");
  const red = Math.round(redValue * 255).toString(16).padStart(2, "0");
  const green = Math.round(greenValue * 255).toString(16).padStart(2, "0");
  const blue = Math.round(blueValue * 255).toString(16).padStart(2, "0");
  return `#${red}${green}${blue}`;
}

function sourceFontToToken(fontName: string, compatibility: Record<string, unknown>): string | undefined {
  const match = jsonArray(compatibility.fonts).find((entry) => {
    const source = jsonObject(entry.source);
    const names = Array.isArray(entry.sourcePostScriptNames)
      ? entry.sourcePostScriptNames.filter((name): name is string => typeof name === "string")
      : [String(source.expectedPostScriptName ?? "")];
    return names.includes(fontName);
  });
  return match ? String(match.fontToken) : undefined;
}

function fontByToken(fonts: readonly ResolvedFont[], token: string): ResolvedFont | undefined {
  return fonts.find((font) => font.token === token);
}

function typographyForLayer(layer: NaverTextLayer, typography: Record<string, unknown>): { fontNames: string[]; styleRuns: Array<Record<string, string>> } | null {
  const token = jsonArray(typography.tokens).find((entry) => String(entry.id) === String(layer.typographyTokenId));
  if (!token) return null;
  const metadata = jsonObject(token.metadata);
  const fontNames = stringArray(metadata.fontNames);
  const styleRuns = jsonArray(metadata.styleRuns).map((entry) => Object.fromEntries(Object.entries(entry).filter(([, value]) => typeof value === "string")) as Record<string, string>);
  return fontNames.length > 0 && styleRuns.length > 0 ? { fontNames, styleRuns } : null;
}

const NAVER_SMARTCHANNEL_GLYPH_SAMPLE = "일이삼사오륙칠팔구십 광고 앱 고지문구 및 심의필 입력 영역 APP";

async function preflightFonts(projectRoot: string, contracts: ContractBundle, provider?: SmartChannelFontResourceProvider): Promise<{ fonts: ResolvedFont[]; issues: ValidationIssue[] }> {
  const policy = jsonObject(contracts.naverRuntimeFontPolicy);
  const fontContract = jsonObject(contracts.naverFontContract);
  const fontContractVersion = String(fontContract.registryVersion ?? "UNKNOWN");
  const runtimeAssets = jsonArray(policy.runtimeAssets);
  const issues: ValidationIssue[] = [];
  const resourceProvider = provider ?? createSmartChannelFontResourceProvider({ id: "DESKTOP_RESOURCE_PROVIDER", root: projectRoot, resolutionMode: "BUNDLED_EXACT" });
  const resolutionMode = resourceProvider.resolutionMode;
  const fonts: ResolvedFont[] = [];
  for (const asset of runtimeAssets) {
    const token = String(asset.id);
    if (asset.required === false) continue;
    const resourceKind = String(asset.resourceKind ?? "DERIVED_STANDALONE_FACE");
    const sourceCollection = jsonObject(asset.sourceCollection);
    const sourceFace = jsonObject(sourceCollection.face);
    const collectionAssetId = String(sourceCollection.assetId ?? "");
    const collectionRelativePath = String(sourceCollection.relativePath ?? "");
    const collectionDigest = String(sourceCollection.sha256 ?? "");
    const collectionFaceIndex = Number(sourceFace.index);
    const collectionFacePostScriptName = String(sourceFace.postScriptName ?? "");
    const collectionFaceVersion = String(sourceFace.version ?? "");
    const relativePath = typeof asset.relativePath === "string" ? asset.relativePath : "";
    const runtimeDigest = typeof asset.runtimeDigest === "string" ? asset.runtimeDigest : "";
    const runtimePostScriptName = String(asset.runtimePostScriptName ?? token);
    const identityPostScriptNames = stringArray(asset.binaryPostScriptNames);
    if (resourceKind === "SINGLE_FONT") {
      if (!relativePath || !runtimeDigest) {
        issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}`, { fontId: token, resourceKind: "SINGLE_FONT" }, { relativePath, runtimeDigest }));
        continue;
      }
      const resolved = await resourceProvider.resolve({ token, assetId: token, kind: "SINGLE_FONT", relativePath, expectedSha256: runtimeDigest, expectedPostScriptName: runtimePostScriptName });
      if (!resolved) {
        issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}`, { fontId: token, relativePath }, null));
        continue;
      }
      const requirement: SmartChannelFontRequirement = { requiredPostScriptName: runtimePostScriptName, runtimePostScriptName, identityPostScriptNames: identityPostScriptNames.length > 0 ? identityPostScriptNames : [runtimePostScriptName], fontToken: token, sourceIdentityStatus: "SOURCE_DIFFERENT_BUILD", compatibilityStatus: "PROJECT_COMPATIBLE_VERIFIED", allowedResolutionModes: [resolutionMode], expectedSha256: runtimeDigest };
      const result = await preflightResolvedExactFont(requirement, resolved.path, resolutionMode);
      if (result.status !== "PASS" || !result.resolvedPath || !result.digest) {
        for (const preflightIssue of result.issues) issues.push(issueFor(contracts, preflightIssue.path === "/font/sha256" ? "FONT_RESOURCE_SHA_MISMATCH" : preflightIssue.code, `/fonts/${token}`, preflightIssue.expected, preflightIssue.actual));
        continue;
      }
      const bytes = await readFile(result.resolvedPath);
      const coverage = inspectFontGlyphCoverage(bytes, typeof asset.glyphCoverageSample === "string" ? asset.glyphCoverageSample : NAVER_SMARTCHANNEL_GLYPH_SAMPLE);
      if (!coverage.covered) {
        issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", `/fonts/${token}`, "required glyph coverage", coverage));
        continue;
      }
      const registrationName = String(asset.runtimeRegistrationName ?? runtimePostScriptName);
      if (!registeredNaverFonts.has(registrationName)) {
        if (GlobalFonts.registerFromPath(result.resolvedPath, registrationName) === null) {
          issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", `/fonts/${token}`, "registered legacy candidate font", null));
          continue;
        }
        registeredNaverFonts.add(registrationName);
      }
      fonts.push({ token, path: result.resolvedPath, digest: result.digest, runtimePostScriptName: registrationName, collectionAssetId: token, collectionDigest: result.digest, collectionFaceIndex: -1, collectionFacePostScriptName: runtimePostScriptName, fontContractVersion, integrationMode: "LEGACY_N77_SINGLE_FONT" });
      continue;
    }
    if (!collectionAssetId || !collectionRelativePath || !collectionDigest || !Number.isInteger(collectionFaceIndex) || collectionFaceIndex < 0 || !collectionFacePostScriptName || !collectionFaceVersion) {
      issues.push(issueFor(
        contracts,
        "FONT_COLLECTION_UNSUPPORTED",
        `/fonts/${token}`,
        { fontId: token, status: "complete FONT_COLLECTION source descriptor" },
        { sourceCollection },
      ));
      continue;
    }
    const resolvedCollection = await resourceProvider.resolve({
      token,
      assetId: collectionAssetId,
      kind: "FONT_COLLECTION",
      relativePath: collectionRelativePath,
      expectedSha256: collectionDigest,
      expectedPostScriptName: collectionFacePostScriptName,
      face: { index: collectionFaceIndex, postScriptName: collectionFacePostScriptName, version: collectionFaceVersion },
    });
    if (!resolvedCollection || resolvedCollection.environmentIndependent !== true || resolvedCollection.providerId !== resourceProvider.id) {
      issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}/sourceCollection`, { assetId: collectionAssetId, relativePath: collectionRelativePath }, { providerId: resourceProvider.id }));
      continue;
    }
    let collectionBytes: Buffer;
    try {
      collectionBytes = await readFile(resolvedCollection.path);
    } catch (error) {
      issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}/sourceCollection`, { assetId: collectionAssetId }, error instanceof Error ? error.message : String(error)));
      continue;
    }
    const actualCollectionDigest = sha256Bytes(collectionBytes);
    if (actualCollectionDigest !== collectionDigest.toLowerCase()) {
      issues.push(issueFor(contracts, "FONT_RESOURCE_SHA_MISMATCH", `/fonts/${token}/sourceCollection/sha256`, collectionDigest.toLowerCase(), actualCollectionDigest));
      continue;
    }
    const inventory = inspectFontCollection(collectionBytes);
    if (!inventory) {
      issues.push(issueFor(contracts, "FONT_COLLECTION_UNSUPPORTED", `/fonts/${token}/sourceCollection`, "decodable TTC collection", "unsupported or invalid collection"));
      continue;
    }
    const selectedFace = inventory.faces[collectionFaceIndex];
    if (!selectedFace) {
      issues.push(issueFor(contracts, "FONT_COLLECTION_FACE_NOT_FOUND", `/fonts/${token}/sourceCollection/face/index`, collectionFaceIndex, { faceCount: inventory.faceCount }));
      continue;
    }
    if (!selectedFace.postScriptNames.includes(collectionFacePostScriptName) || !selectedFace.versions.includes(collectionFaceVersion)) {
      issues.push(issueFor(contracts, "FONT_COLLECTION_FACE_IDENTITY_MISMATCH", `/fonts/${token}/sourceCollection/face`, { index: collectionFaceIndex, postScriptName: collectionFacePostScriptName, version: collectionFaceVersion }, { index: selectedFace.index, postScriptNames: selectedFace.postScriptNames, versions: selectedFace.versions }));
      continue;
    }
    const sample = typeof asset.glyphCoverageSample === "string" ? asset.glyphCoverageSample : NAVER_SMARTCHANNEL_GLYPH_SAMPLE;
    const collectionCoverage = inspectFontCollectionFaceGlyphCoverage(collectionBytes, collectionFaceIndex, sample);
    if (!collectionCoverage.covered) {
      issues.push(issueFor(contracts, "FONT_COLLECTION_FACE_IDENTITY_MISMATCH", `/fonts/${token}/sourceCollection/face/cmap`, { fontId: token, status: "required glyph coverage" }, collectionCoverage));
      continue;
    }
    if (!relativePath || !runtimeDigest || asset.assetStatus === "UNRESOLVED_ASSET" || asset.smartChannelAllowed === false) {
      issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}/derivedResource`, { fontId: token, status: "verified derived standalone face" }, { assetStatus: String(asset.assetStatus ?? "UNRESOLVED_ASSET"), relativePath: relativePath || null, runtimeDigest: runtimeDigest || null }));
      continue;
    }
    const resolved = await resourceProvider.resolve({ token, assetId: `${collectionAssetId}:FACE_${collectionFaceIndex}`, kind: "DERIVED_STANDALONE_FACE", relativePath, expectedSha256: runtimeDigest, expectedPostScriptName: runtimePostScriptName, face: { index: collectionFaceIndex, postScriptName: collectionFacePostScriptName, version: collectionFaceVersion } });
    if (!resolved || resolved.environmentIndependent !== true || resolved.providerId !== resourceProvider.id) {
      issues.push(issueFor(contracts, "FONT_RESOURCE_MISSING", `/fonts/${token}/derivedResource`, { fontId: token, status: "renderer-owned verified derived face" }, { providerId: resourceProvider.id, relativePath }));
      continue;
    }
    const requirement: SmartChannelFontRequirement = {
      requiredPostScriptName: runtimePostScriptName,
      runtimePostScriptName,
      identityPostScriptNames: identityPostScriptNames.length > 0 ? identityPostScriptNames : [collectionFacePostScriptName],
      fontToken: token,
      sourceIdentityStatus: "SOURCE_EXACT",
      compatibilityStatus: "PSD_EXACT_RENDERER_OWNED",
      allowedResolutionModes: [resolutionMode],
      expectedSha256: runtimeDigest,
      expectedVersion: collectionFaceVersion,
    };
    const result = await preflightResolvedExactFont(requirement, resolved.path, resolutionMode);
    if (result.status !== "PASS" || !result.resolvedPath || !result.digest) {
      for (const preflightIssue of result.issues) {
        const code = preflightIssue.path === "/font/sha256"
          ? "FONT_RESOURCE_SHA_MISMATCH"
          : preflightIssue.path === "/font/postScriptName" || preflightIssue.path === "/font/version"
            ? "FONT_DERIVED_RESOURCE_PROVENANCE_MISMATCH"
            : preflightIssue.code;
        issues.push(issueFor(contracts, code, `/fonts/${token}/derivedResource`, preflightIssue.expected, preflightIssue.actual));
      }
      continue;
    }
    const bytes = await readFile(result.resolvedPath);
    const identity = inspectFontIdentity(bytes);
    if (!identity) {
      issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", `/fonts/${token}`, { fontId: token, status: "decodable font" }, "undecodable"));
      continue;
    }
    const identityResult = evaluateFontIdentity(requirement, resolutionMode, { postScriptNames: identity.postScriptNames, digest: result.digest, versions: identity.versions });
    if (identityResult.status !== "PASS") {
      for (const preflightIssue of identityResult.issues) issues.push(issueFor(contracts, preflightIssue.code, `/fonts/${token}`, preflightIssue.expected, preflightIssue.actual));
      continue;
    }
    const glyphCoverage = inspectFontGlyphCoverage(bytes, sample);
    if (!glyphCoverage.covered) {
      issues.push(issueFor(contracts, "FONT_DERIVED_RESOURCE_PROVENANCE_MISMATCH", `/fonts/${token}/derivedResource/cmap`, { fontId: token, status: "required glyph coverage" }, glyphCoverage));
      continue;
    }
    const equivalence = compareFontCollectionFaceToStandalone(collectionBytes, collectionFaceIndex, bytes);
    const equivalenceFailures = equivalence?.filter((table) => table.status === "MISSING" || table.status === "MISMATCH") ?? [];
    if (!equivalence || equivalenceFailures.length > 0 || identity.postScriptNames.includes(collectionFacePostScriptName) === false || identity.versions.includes(collectionFaceVersion) === false || identity.weightClass !== selectedFace.weightClass) {
      issues.push(issueFor(contracts, "FONT_DERIVED_RESOURCE_PROVENANCE_MISMATCH", `/fonts/${token}/derivedResource`, { sourceCollectionSha256: collectionDigest, faceIndex: collectionFaceIndex, postScriptName: collectionFacePostScriptName, version: collectionFaceVersion, weightClass: selectedFace.weightClass, tableEquivalence: "IDENTICAL_OR_HEAD_CHECKSUM_ONLY" }, { postScriptNames: identity.postScriptNames, versions: identity.versions, weightClass: identity.weightClass, equivalenceFailures }));
      continue;
    }
    const registrationName = String(asset.runtimeRegistrationName ?? asset.runtimePostScriptName);
    if (!registeredNaverFonts.has(registrationName)) {
      const registered = GlobalFonts.registerFromPath(result.resolvedPath, registrationName);
      if (registered === null) {
        issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", `/fonts/${token}`, { fontId: token, status: "registered font" }, "registerFromPath returned null"));
        continue;
      }
      registeredNaverFonts.add(registrationName);
    }
    fonts.push({ token, path: result.resolvedPath, digest: result.digest, runtimePostScriptName: registrationName, collectionAssetId, collectionDigest, collectionFaceIndex, collectionFacePostScriptName, fontContractVersion, integrationMode: "VERIFIED_DERIVED_STANDALONE_FACE" });
  }
  return { fonts, issues: sortAndDedupeIssues(issues) };
}

async function decodeRgba(bytes: Buffer): Promise<DecodedRgba> {
  const decoded = await sharp(bytes, { failOn: "error" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { bytes: Buffer.from(decoded.data), width: decoded.info.width, height: decoded.info.height };
}

function putImageData(canvas: Canvas, image: DecodedRgba, x: number, y: number): void {
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.bytes.buffer, image.bytes.byteOffset, image.bytes.byteLength), image.width, image.height), x, y);
}

type AlphaComponent = { count: number; bounds: BBox; pixels: number[] };

function connectedAlphaComponents(image: DecodedRgba, threshold = NAVER_SMARTCHANNEL_LAYOUT_VISIBLE_THRESHOLD): AlphaComponent[] {
  const visited = new Uint8Array(image.width * image.height);
  const components: AlphaComponent[] = [];
  const offsets = [-1, 0, 1];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = y * image.width + x;
      if (visited[start] === 1 || (image.bytes[start * 4 + 3] ?? 0) < threshold) continue;
      const queue: number[] = [start];
      const pixels: number[] = [];
      visited[start] = 1;
      let count = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      for (let index = 0; index < queue.length; index += 1) {
        const currentIndex = queue[index] as number;
        const currentX = currentIndex % image.width;
        const currentY = Math.floor(currentIndex / image.width);
        pixels.push(currentIndex);
        count += 1;
        minX = Math.min(minX, currentX);
        minY = Math.min(minY, currentY);
        maxX = Math.max(maxX, currentX);
        maxY = Math.max(maxY, currentY);
        for (const deltaY of offsets) {
          for (const deltaX of offsets) {
            if (deltaX === 0 && deltaY === 0) continue;
            const nextX = currentX + deltaX;
            const nextY = currentY + deltaY;
            if (nextX < 0 || nextX >= image.width || nextY < 0 || nextY >= image.height) continue;
            const nextIndex = nextY * image.width + nextX;
            if (visited[nextIndex] === 1 || (image.bytes[nextIndex * 4 + 3] ?? 0) < threshold) continue;
            visited[nextIndex] = 1;
            queue.push(nextIndex);
          }
        }
      }
      components.push({ count, bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, pixels });
    }
  }
  return components;
}

function componentOrder(left: AlphaComponent, right: AlphaComponent): number {
  if (left.count !== right.count) return right.count - left.count;
  if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
  return left.bounds.x - right.bounds.x;
}

function contentAlphaBounds(image: DecodedRgba): BBox | null {
  const components = connectedAlphaComponents(image, NAVER_SMARTCHANNEL_LAYOUT_VISIBLE_THRESHOLD).sort(componentOrder);
  if (components.length === 0) return null;
  const selected = components.filter((component) => component.count >= NAVER_SMARTCHANNEL_MIN_VISIBLE_COMPONENT_PIXELS);
  const seeds = selected.length > 0 ? selected : [components[0] as AlphaComponent];

  // Preserve antialiased alpha >= 1 pixels that are connected to the selected
  // layout-visible component, while excluding unrelated isolated noise from
  // the trim bbox. The original RGBA values remain untouched.
  const visited = new Uint8Array(image.width * image.height);
  const queue = seeds.flatMap((component) => component.pixels);
  for (const pixel of queue) visited[pixel] = 1;
  const offsets = [-1, 0, 1];
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const pixel = queue[index] as number;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    for (const deltaY of offsets) {
      for (const deltaX of offsets) {
        if (deltaX === 0 && deltaY === 0) continue;
        const nextX = x + deltaX;
        const nextY = y + deltaY;
        if (nextX < 0 || nextX >= image.width || nextY < 0 || nextY >= image.height) continue;
        const nextIndex = nextY * image.width + nextX;
        if (visited[nextIndex] === 1 || (image.bytes[nextIndex * 4 + 3] ?? 0) < NAVER_SMARTCHANNEL_TRIM_PRESERVE_THRESHOLD) continue;
        visited[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }
  }
  return maxX < minX ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function opaquePixelCount(image: DecodedRgba, threshold = NAVER_SMARTCHANNEL_TRIM_PRESERVE_THRESHOLD): number {
  let count = 0;
  for (let index = 3; index < image.bytes.length; index += 4) if ((image.bytes[index] ?? 0) >= threshold) count += 1;
  return count;
}

function cropRgba(image: DecodedRgba, bounds: BBox): DecodedRgba {
  const bytes = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.y + y) * image.width + bounds.x) * 4;
    const targetStart = y * bounds.width * 4;
    image.bytes.copy(bytes, targetStart, sourceStart, sourceStart + bounds.width * 4);
  }
  return { bytes, width: bounds.width, height: bounds.height };
}

async function resizeRgba(image: DecodedRgba, width: number, height: number): Promise<DecodedRgba> {
  const resized = await sharp(image.bytes, { raw: { width: image.width, height: image.height, channels: 4 } })
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { bytes: Buffer.from(resized.data), width: resized.info.width, height: resized.info.height };
}

function placedBounds(image: DecodedRgba, x: number, y: number): BBox | null {
  const bounds = contentAlphaBounds(image);
  return bounds ? { ...bounds, x: bounds.x + x, y: bounds.y + y } : null;
}

function countAlphaInside(image: DecodedRgba, x: number, y: number, region: BBox): number {
  let count = 0;
  const left = Math.max(0, region.x - x);
  const top = Math.max(0, region.y - y);
  const right = Math.min(image.width, region.x + region.width - x);
  const bottom = Math.min(image.height, region.y + region.height - y);
  for (let currentY = top; currentY < bottom; currentY += 1) {
    for (let currentX = left; currentX < right; currentX += 1) {
      if ((image.bytes[(currentY * image.width + currentX) * 4 + 3] ?? 0) >= NAVER_SMARTCHANNEL_TRIM_PRESERVE_THRESHOLD) count += 1;
    }
  }
  return count;
}

function transformedAlphaBounds(image: DecodedRgba, token: NaverPlacementToken): BBox | null {
  const source = contentAlphaBounds(image);
  if (!source) return null;
  if (token.coordinateSpace.type === "FULL_CANVAS_SOURCE") return source;
  if (token.coordinateSpace.type === "SLOT_LOCAL_SOURCE") return { ...source, x: source.x + Number(token.placementFrame.x), y: source.y + Number(token.placementFrame.y ?? 0) };
  const transform = token.sourceFrame?.canvasTransform;
  if (!transform) return null;
  const x = Number(transform[0]);
  const y = Number(transform[1]);
  const width = Number(transform[2]) - x;
  const height = Number(transform[5]) - y;
  const transformed = { x: Math.round(x + (source.x / image.width) * width), y: Math.round(y + (source.y / image.height) * height), width: Math.max(1, Math.round((source.width / image.width) * width)), height: Math.max(1, Math.round((source.height / image.height) * height)) };
  const canvas = token.coordinateSpace.canvas;
  if (!canvas) return transformed;
  const left = Math.max(0, transformed.x);
  const top = Math.max(0, transformed.y);
  const right = Math.min(canvas.width, transformed.x + transformed.width);
  const bottom = Math.min(canvas.height, transformed.y + transformed.height);
  return right <= left || bottom <= top ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

function containedBy(inner: BBox | null, outer: BBox): boolean {
  return inner === null || inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

async function verifiedAsset(relativePath: string, expectedSha256: string | null | undefined, contracts: ContractBundle, inputRoot: string, pointer: string): Promise<{ path: string; bytes: Buffer; digest: string; mime: "image/png" | "image/jpeg"; image: DecodedRgba } | null> {
  let filePath: string;
  try {
    filePath = await resolveTrustedInputFile(inputRoot, relativePath);
  } catch (error) {
    throw issueFor(contracts, error instanceof PathSecurityError ? "KBR-INPUT-009" : "NAVER_SMARTCHANNEL_ASSET_MISSING", pointer, "trusted input file", error instanceof Error ? error.message : String(error));
  }
  try {
    const inspected = await inspectImageFile(filePath);
    const digest = sha256Bytes(inspected.bytes);
    if (expectedSha256 && expectedSha256.toLowerCase() !== digest) throw issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_DIGEST_MISMATCH", pointer, expectedSha256.toLowerCase(), digest);
    const image = await decodeRgba(inspected.bytes);
    return { path: filePath, bytes: inspected.bytes, digest, mime: inspected.metadata.detectedMimeType, image };
  } catch (error) {
    if ((error as ValidationIssue).code && (error as ValidationIssue).messageKey) throw error;
    throw issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_MISSING", pointer, "decodable PNG/JPEG", error instanceof Error ? error.message : String(error));
  }
}

function requiredSourceDimensions(token: NaverPlacementToken, height: number): { width: number; height: number } {
  if (token.coordinateSpace.type === "FULL_CANVAS_SOURCE") return { width: NAVER_SMARTCHANNEL_CANVAS_WIDTH, height };
  if (token.coordinateSpace.type === "SLOT_LOCAL_SOURCE") return { width: Number(token.coordinateSpace.width), height: Number(token.coordinateSpace.height) };
  return { width: Number(token.sourceFrame?.width), height: Number(token.sourceFrame?.height) };
}

export type SmartChannelObjectNormalizationOptions = {
  contain?: boolean;
  offsetX?: number;
  offsetY?: number;
};

export async function normalizeSmartChannelObject(
  image: DecodedRgba,
  targetRegion: BBox,
  options: SmartChannelObjectNormalizationOptions = {},
): Promise<SmartChannelObjectRaster> {
  const alpha = contentAlphaBounds(image);
  if (!alpha) {
    return {
      image: { bytes: Buffer.alloc(0), width: 0, height: 0 },
      destination: { x: targetRegion.x, y: targetRegion.y },
      finalBounds: null,
      legacyPrecomposed: false,
      diagnostics: {
        sourceCanvas: { width: image.width, height: image.height },
        alphaBounds: null,
        normalizedSize: { width: 0, height: 0, scale: 0 },
        finalBounds: null,
        targetRegion,
        opaquePixelCount: 0,
        maxOpaquePixelCount: NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS,
      },
    };
  }
  const trimmed = cropRgba(image, alpha);
  const contain = options.contain !== false;
  const regionWidth = Math.min(NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH, Math.max(1, Math.round(targetRegion.width)));
  const regionHeight = Math.min(NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT, Math.max(1, Math.round(targetRegion.height)));
  const scale = contain
    ? Math.min(NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH / trimmed.width, NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT / trimmed.height, regionWidth / trimmed.width, regionHeight / trimmed.height, NAVER_SMARTCHANNEL_MAX_UPSCALE)
    : 1;
  const normalizedWidth = Math.max(1, Math.round(trimmed.width * scale));
  const normalizedHeight = Math.max(1, Math.round(trimmed.height * scale));
  const normalized = await resizeRgba(trimmed, normalizedWidth, normalizedHeight);
  const destinationX = targetRegion.x + Math.floor((targetRegion.width - normalized.width) / 2) + Math.trunc(options.offsetX ?? 0);
  const destinationY = targetRegion.y + Math.floor((targetRegion.height - normalized.height) / 2) + Math.trunc(options.offsetY ?? 0);
  const finalBounds = placedBounds(normalized, destinationX, destinationY);
  const diagnostics: SmartChannelObjectDiagnostics = {
    sourceCanvas: { width: image.width, height: image.height },
    alphaBounds: alpha,
    normalizedSize: { width: normalizedWidth, height: normalizedHeight, scale },
    finalBounds,
    targetRegion,
    opaquePixelCount: opaquePixelCount(normalized),
    maxOpaquePixelCount: NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS,
  };
  return { image: normalized, destination: { x: destinationX, y: destinationY }, finalBounds, diagnostics, legacyPrecomposed: false };
}

function drawSourceObject(canvas: Canvas, image: DecodedRgba, token: NaverPlacementToken): void {
  const context = canvas.getContext("2d");
  if (token.coordinateSpace.type === "FULL_CANVAS_SOURCE") {
    putImageData(canvas, image, 0, 0);
    return;
  }
  if (token.coordinateSpace.type === "SLOT_LOCAL_SOURCE") {
    putImageData(canvas, image, Number(token.placementFrame.x), Number(token.placementFrame.y ?? 0));
    return;
  }
  const transform = token.sourceFrame?.canvasTransform;
  if (!transform || transform.length < 8) throw new Error("SmartChannel source transform is missing");
  const x = Number(transform[0]);
  const y = Number(transform[1]);
  const width = Number(transform[2]) - x;
  const height = Number(transform[5]) - y;
  const sourceCanvas = createCanvas(image.width, image.height);
  putImageData(sourceCanvas, image, 0, 0);
  context.drawImage(sourceCanvas, x, y, width, height);
}

type FixedComponentFailureReason =
  | "MISSING_REGISTRY_ENTRY"
  | "MISSING_RUNTIME_ASSET"
  | "DIGEST_MISMATCH"
  | "DECODE_FAILED"
  | "PLACEMENT_MISMATCH"
  | "UNSUPPORTED_FOR_TEMPLATE";

function fixedComponentIssue(
  contracts: ContractBundle,
  id: string,
  templateId: string,
  failureReason: FixedComponentFailureReason,
  expectedDigest: string | null,
  actualDigest: string | null,
  expectedBounds: BBox | null,
  actualBounds: BBox | null,
  runtimeResourceId: string | null,
  runtimeResourcePath: string | null,
  assetExists: boolean,
  decoded: boolean,
  registryEntry: boolean,
  packagedRequired: boolean,
  packageEntry: boolean,
): ValidationIssue {
  return issueFor(
    contracts,
    "NAVER_SMARTCHANNEL_FIXED_COMPONENT_INVALID",
    `/fixedComponents/${id}`,
    {
      componentId: id,
      templateId,
      failureReason,
      expectedDigest,
      expectedBounds,
      runtimeResourceId,
      runtimeResourcePath,
      packagedRequired,
    },
    {
      componentId: id,
      templateId,
      failureReason,
      actualDigest,
      actualBounds,
      runtimeResourceId,
      runtimeResourcePath,
      assetExists,
      decoded,
      registryEntry,
      packageEntry,
    },
  );
}

function fixedRuntimeResource(contracts: ContractBundle, assetPath: string, expectedSha256: string): SmartChannelJson | null {
  const expected = expectedSha256.toLowerCase();
  return jsonArray(contracts.naverFixedComponentRuntime.resources).find((entry) =>
    String(entry.runtimePath) === assetPath && String(entry.expectedSha256).toLowerCase() === expected,
  ) ?? null;
}

async function drawVerifiedFixedAsset(
  canvas: Canvas,
  projectRoot: string,
  assetPath: string,
  expectedSha256: string,
  expectedBounds: BBox,
  contracts: ContractBundle,
  id: string,
  templateId: string,
): Promise<{ id: string; digest: string; x: number; y: number; width: number; height: number } | null> {
  const resource = fixedRuntimeResource(contracts, assetPath, expectedSha256);
  const runtimeResourceId = resource ? String(resource.id) : null;
  const packagedRequired = resource?.packagedRequired === true;
  if (!resource) {
    throw fixedComponentIssue(contracts, id, templateId, "MISSING_REGISTRY_ENTRY", expectedSha256, null, expectedBounds, null, null, assetPath, false, false, false, false, false);
  }
  if (!Array.isArray(resource.templates) || !resource.templates.includes(templateId)) {
    throw fixedComponentIssue(contracts, id, templateId, "UNSUPPORTED_FOR_TEMPLATE", expectedSha256, null, expectedBounds, null, runtimeResourceId, assetPath, false, false, true, packagedRequired, false);
  }

  let filePath: string;
  try {
    filePath = await resolveTrustedInputFile(projectRoot, assetPath);
  } catch {
    throw fixedComponentIssue(contracts, id, templateId, "MISSING_RUNTIME_ASSET", expectedSha256, null, expectedBounds, null, runtimeResourceId, assetPath, false, false, true, packagedRequired, false);
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    throw fixedComponentIssue(contracts, id, templateId, "MISSING_RUNTIME_ASSET", expectedSha256, null, expectedBounds, null, runtimeResourceId, assetPath, false, false, true, packagedRequired, false);
  }

  const digest = sha256Bytes(bytes);
  if (digest !== expectedSha256.toLowerCase()) {
    throw fixedComponentIssue(contracts, id, templateId, "DIGEST_MISMATCH", expectedSha256, digest, expectedBounds, null, runtimeResourceId, assetPath, true, false, true, packagedRequired, true);
  }

  let image: DecodedRgba;
  try {
    image = await decodeRgba(bytes);
  } catch {
    throw fixedComponentIssue(contracts, id, templateId, "DECODE_FAILED", expectedSha256, digest, expectedBounds, null, runtimeResourceId, assetPath, true, false, true, packagedRequired, true);
  }

  const actualBounds = { x: expectedBounds.x, y: expectedBounds.y, width: image.width, height: image.height };
  if (image.width !== expectedBounds.width || image.height !== expectedBounds.height) {
    throw fixedComponentIssue(contracts, id, templateId, "PLACEMENT_MISMATCH", expectedSha256, digest, expectedBounds, actualBounds, runtimeResourceId, assetPath, true, true, true, packagedRequired, true);
  }
  putImageData(canvas, image, expectedBounds.x, expectedBounds.y);
  return { id, digest, x: expectedBounds.x, y: expectedBounds.y, width: image.width, height: image.height };
}

function rasterBaselineDelta(layer: NaverTextLayer, typographyRegistry: Record<string, unknown>): number {
  const adapter = jsonArray(typographyRegistry.rasterAlignmentAdapters).find((entry) =>
    stringArray(entry.typographyTokenIds).includes(String(layer.typographyTokenId ?? ""))
    && stringArray(entry.roles).includes(layer.role),
  );
  const delta = Number(adapter?.baselineDeltaY ?? 0);
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) throw new Error("Typography raster alignment adapter has an invalid baselineDeltaY");
  return delta;
}

function drawTrackedText(context: ReturnType<Canvas["getContext"]>, text: string, layer: NaverTextLayer, font: ResolvedFont, color: string, style: Record<string, string>, baselineDeltaY: number): number {
  const fontSize = Number(style.FontSize);
  const trackingValue = Number(style.Tracking);
  if (!Number.isFinite(fontSize) || !Number.isFinite(trackingValue) || fontSize <= 0) throw new Error("Typography token has invalid FontSize or Tracking");
  const tracking = trackingValue * fontSize / 1000;
  context.font = `${fontSize}px "${font.runtimePostScriptName}"`;
  context.textBaseline = "alphabetic";
  context.fillStyle = color;
  let x = layer.role === "CTA_LABEL" ? layer.textPlacement.boxX : layer.textPlacement.originX;
  for (const character of [...text]) {
    context.fillText(character, x, layer.textPlacement.baselineY + baselineDeltaY);
    x += context.measureText(character).width + tracking;
  }
  const startX = layer.role === "CTA_LABEL" ? layer.textPlacement.boxX : layer.textPlacement.originX;
  return Math.max(0, x - startX - (text.length > 0 ? tracking : 0));
}

function drawTrackedTextWithRasterEvidence(canvas: Canvas, text: string, layer: NaverTextLayer, font: ResolvedFont, color: string, style: Record<string, string>, baselineDeltaY: number): { width: number; bounds: BBox | null; nonTransparentPixelCount: number; diagnosticSurfaceClipped: boolean } {
  // The isolated surface deliberately extends past the 750 px production canvas.
  // Validation therefore observes overrun ink instead of clipping it at the
  // canvas or the PSD layout box. Compositing below still crops to final canvas.
  const diagnosticWidth = Math.max(canvas.width, NAVER_SMARTCHANNEL_DIAGNOSTIC_RASTER_WIDTH);
  const isolated = createCanvas(diagnosticWidth, canvas.height);
  const isolatedContext = isolated.getContext("2d");
  const width = drawTrackedText(isolatedContext, text, layer, font, color, style, baselineDeltaY);
  const rgba = isolatedContext.getImageData(0, 0, diagnosticWidth, canvas.height).data;
  let minX = diagnosticWidth;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  let nonTransparentPixelCount = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < diagnosticWidth; x += 1) {
      if ((rgba[((y * diagnosticWidth) + x) * 4 + 3] ?? 0) === 0) continue;
      nonTransparentPixelCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  canvas.getContext("2d").drawImage(isolated, 0, 0);
  return {
    width,
    bounds: maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    nonTransparentPixelCount,
    diagnosticSurfaceClipped: maxX === diagnosticWidth - 1,
  };
}

function layerInputKey(role: NaverTextLayer["role"], index: number): keyof SmartChannelContent {
  if (role === "HEADLINE") return index === 0 ? "headline" : "headlineLine2";
  if (role === "SUBCOPY") return index === 0 ? "subcopy" : "subcopyLine4";
  if (role === "DISCLOSURE") return index === 0 ? "disclosureLine1" : "disclosureLine2";
  return "ctaOption";
}

function visibleTextLayers(metadata: Record<string, unknown>, templateId: string): NaverTextLayer[] {
  const template = jsonArray(metadata.templates).find((entry) => String(entry.templateId) === templateId);
  return jsonArray(template?.textLayers).filter((entry) => entry.visible !== false && ["HEADLINE", "SUBCOPY", "DISCLOSURE"].includes(String(entry.role))).sort((left, right) => Number(jsonObject(left.textPlacement).boxY) - Number(jsonObject(right.textPlacement).boxY)) as unknown as NaverTextLayer[];
}

function validateTemplateContent(
  contracts: ContractBundle,
  template: NaverTemplate,
  metadata: Record<string, unknown>,
  content: SmartChannelContent,
): ValidationIssue[] {
  const layers = visibleTextLayers(metadata, template.templateId);
  const requiredKeys = new Set<keyof SmartChannelContent>();
  const roleCounters = new Map<NaverTextLayer["role"], number>();
  for (const layer of layers) {
    const index = roleCounters.get(layer.role) ?? 0;
    roleCounters.set(layer.role, index + 1);
    requiredKeys.add(layerInputKey(layer.role, index));
  }
  if (template.affordance === "APP_CTA") requiredKeys.add("ctaOption");

  const issues: ValidationIssue[] = [];
  for (const key of requiredKeys) {
    const value = content[key];
    if (typeof value !== "string" || value.length === 0) {
      issues.push(issueFor(contracts, key === "ctaOption" ? "NAVER_SMARTCHANNEL_CTA_INVALID" : "NAVER_SMARTCHANNEL_TEXT_REQUIRED", `/content/${key}`, "required source-backed content field", value));
    }
  }
  if (template.affordance !== "APP_CTA" && content.ctaOption !== undefined) {
    issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "ctaOption is only allowed for APP_CTA templates", content.ctaOption));
  }
  const allowedKeys = new Set<keyof SmartChannelContent>([...requiredKeys]);
  for (const key of Object.keys(content) as Array<keyof SmartChannelContent>) {
    if (!allowedKeys.has(key) && content[key] !== undefined) {
      issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/content/${key}`, "field supported by the selected source template", content[key]));
    }
  }
  return issues;
}

function ctaTextLayer(metadata: Record<string, unknown>, templateId: string, label: string): NaverTextLayer | null {
  const template = jsonArray(metadata.templates).find((entry) => String(entry.templateId) === templateId);
  const layer = jsonArray(template?.textLayers).find((entry) => entry.visible !== false && entry.role === "CTA_LABEL" && String(entry.name) === label);
  return layer ? layer as unknown as NaverTextLayer : null;
}

function validateInputShape(request: unknown, contracts: ContractBundle): { request?: SmartChannelRenderRequest; issues: ValidationIssue[] } {
  const value = jsonObject(request);
  const issues: ValidationIssue[] = [];
  if (value.schemaVersion !== undefined && value.schemaVersion !== "1.0.0") issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/schemaVersion", "1.0.0", value.schemaVersion));
  if (value.channel !== "NAVER_GFA") issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/channel", "NAVER_GFA", value.channel));
  if (value.placement !== "SMARTCHANNEL") issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/placement", "SMARTCHANNEL", value.placement));
  if (value.artifactCardinality !== undefined && value.artifactCardinality !== "SINGLE") issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/artifactCardinality", "SINGLE", value.artifactCardinality));
  if (typeof value.templateId !== "string" || value.templateId.length === 0) issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/templateId", "non-empty string", value.templateId));
  const content = jsonObject(value.content);
  const assets = jsonObject(value.assets);
  const object = jsonObject(assets.object);
  const output = jsonObject(value.output);
  if (typeof content.headline !== "string" || content.headline.trim().length === 0) issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_TEXT_REQUIRED", "/content/headline", "non-empty string", content.headline));
  if (typeof object.path !== "string" || object.path.length === 0) issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_MISSING", "/assets/object/path", "trusted relative path", object.path));
  if (typeof output.directory !== "string" || typeof output.baseName !== "string") issues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", "/output", "directory and baseName", output));
  if (issues.length > 0) return { issues };
  const logo = jsonObject(assets.advertiserLogo);
  const normalizedAssets: SmartChannelRenderRequest["assets"] = {
    object: { path: String(object.path), expectedSha256: typeof object.expectedSha256 === "string" ? object.expectedSha256.toLowerCase() : null },
    ...(typeof logo.path === "string" ? { advertiserLogo: { path: String(logo.path), expectedSha256: typeof logo.expectedSha256 === "string" ? logo.expectedSha256.toLowerCase() : null } } : {}),
  };
  return {
    request: {
      schemaVersion: "1.0.0",
      channel: "NAVER_GFA",
      placement: "SMARTCHANNEL",
      layoutMode: "TEMPLATE_LOCKED",
      compositionMode: "RENDERER_COMPOSED",
      artifactCardinality: "SINGLE",
      templateId: String(value.templateId),
      content: Object.fromEntries(Object.entries(content).map(([key, item]) => [key, textValue(item)]).filter((entry): entry is [string, string] => entry[1] !== undefined)) as SmartChannelContent,
      assets: normalizedAssets,
      output: { directory: String(output.directory), baseName: String(output.baseName), overwrite: output.overwrite === true },
    },
    issues,
  };
}

function horizontalOverflowEvidence(layer: NaverTextLayer, raster: { width: number; bounds: BBox | null; diagnosticSurfaceClipped: boolean }): SmartChannelTextRoleReport["horizontalOverflowEvidence"] {
  const sourceRight = Number(layer.pixelBounds[2]);
  const rightBoundary = Number.isFinite(sourceRight) ? sourceRight : layer.textPlacement.boxX + layer.textPlacement.boxWidth;
  // Pixel coordinates are compared inclusively. `actualRasterBounds` remains a
  // conventional x/width bbox, while actualRightEdge is its last alpha pixel.
  const actualRightEdge = raster.bounds ? raster.bounds.x + raster.bounds.width - 1 : null;
  const clipped = actualRightEdge !== null && actualRightEdge > NAVER_SMARTCHANNEL_CANVAS_WIDTH - 1;
  const overflow = actualRightEdge === null || actualRightEdge > rightBoundary || clipped || raster.diagnosticSurfaceClipped;
  return {
    measuredWidth: raster.width,
    actualRasterBounds: raster.bounds,
    rightBoundary,
    actualRightEdge,
    decisionBasis: "ACTUAL_RASTER_BOUNDARY",
    overflow,
    clipped,
    diagnosticSurfaceClipped: raster.diagnosticSurfaceClipped,
  };
}

/**
 * Internal/test diagnostic preflight. It does not expose a public JSON render
 * mode, publish files, or bypass the production text primitive. Each role is
 * rasterized on the same isolated draw path used by renderSmartChannel.
 */
export async function diagnoseSmartChannelTextRaster(
  templateId: string,
  content: SmartChannelContent,
  options: Pick<SmartChannelRenderOptions, "projectRoot" | "contracts" | "fontResourceProvider">,
): Promise<SmartChannelTextRasterDiagnostic> {
  const template = templates(options.contracts.naverTemplateContract).find((entry) => entry.templateId === templateId);
  if (!template) throw new Error(`Unknown SmartChannel template: ${templateId}`);
  const preflight = await preflightFonts(options.projectRoot, options.contracts, options.fontResourceProvider);
  const fontErrors = preflight.issues.filter((issue) => issue.severity === "ERROR");
  if (fontErrors.length > 0) throw new Error(`SmartChannel font preflight failed: ${JSON.stringify(fontErrors)}`);
  const canvas = createCanvas(NAVER_SMARTCHANNEL_CANVAS_WIDTH, template.height);
  const layers = visibleTextLayers(options.contracts.naverPsdMetadata, templateId);
  const roleCounters = new Map<string, number>();
  const textRoles: SmartChannelTextRoleReport[] = [];
  for (const layer of layers) {
    const index = roleCounters.get(layer.role) ?? 0;
    roleCounters.set(layer.role, index + 1);
    const inputKey = layerInputKey(layer.role, index);
    const text = content[inputKey];
    if (!text) continue;
    const typography = typographyForLayer(layer, options.contracts.naverTypography);
    const style = typography?.styleRuns[0];
    const fontToken = typography ? sourceFontToToken(typography.fontNames[0] ?? "", options.contracts.naverFontCompatibility) : null;
    const font = fontToken ? fontByToken(preflight.fonts, fontToken) : undefined;
    if (!typography || !style || !font) throw new Error(`Unresolved diagnostic typography for ${templateId}/${inputKey}`);
    const baselineDeltaY = rasterBaselineDelta(layer, options.contracts.naverTypography);
    const raster = drawTrackedTextWithRasterEvidence(canvas, text, layer, font, parseFillColor(style.FillColor), style, baselineDeltaY);
    const evidence = horizontalOverflowEvidence(layer, raster);
    textRoles.push({
      role: layer.role,
      inputKey,
      text,
      sourceLayer: layer.name,
      typographyTokenId: String(layer.typographyTokenId ?? ""),
      box: { x: layer.textPlacement.boxX, y: layer.textPlacement.boxY, width: layer.textPlacement.boxWidth, height: layer.textPlacement.boxHeight },
      expectedOrigin: { x: layer.textPlacement.originX, y: layer.textPlacement.baselineY },
      actualRasterBounds: raster.bounds,
      baselineY: layer.textPlacement.baselineY,
      rasterBaselineY: layer.textPlacement.baselineY + baselineDeltaY,
      measuredWidth: raster.width,
      horizontalOverflowEvidence: evidence,
      overflow: evidence.overflow,
    });
  }
  return { templateId, canvas: { width: canvas.width, height: canvas.height }, textRoles };
}

/** Reproducible source-layer audit for token-scoped PSD-to-Skia adapters. */
export async function auditSmartChannelTypographyTokenRasterAlignment(
  typographyTokenId: string,
  options: Pick<SmartChannelRenderOptions, "projectRoot" | "contracts" | "fontResourceProvider">,
): Promise<SmartChannelTypographyRasterAlignmentAudit> {
  const preflight = await preflightFonts(options.projectRoot, options.contracts, options.fontResourceProvider);
  const fontErrors = preflight.issues.filter((issue) => issue.severity === "ERROR");
  if (fontErrors.length > 0) throw new Error(`SmartChannel font preflight failed: ${JSON.stringify(fontErrors)}`);
  const rows: SmartChannelTypographyRasterAlignmentAudit["rows"] = [];
  for (const sourceTemplate of jsonArray(options.contracts.naverPsdMetadata.templates)) {
    const templateId = String(sourceTemplate.templateId);
    const template = templates(options.contracts.naverTemplateContract).find((entry) => entry.templateId === templateId);
    if (!template) continue;
    for (const entry of jsonArray(sourceTemplate.textLayers)) {
      if (entry.visible === false || entry.guideLayer === true || String(entry.typographyTokenId ?? "") !== typographyTokenId) continue;
      const layer = entry as unknown as NaverTextLayer;
      if (!["HEADLINE", "SUBCOPY", "DISCLOSURE", "CTA_LABEL"].includes(layer.role)) continue;
      const sourceText = String(entry.text ?? "");
      if (!sourceText) continue;
      const typography = typographyForLayer(layer, options.contracts.naverTypography);
      const style = typography?.styleRuns[0];
      const fontToken = typography ? sourceFontToToken(typography.fontNames[0] ?? "", options.contracts.naverFontCompatibility) : null;
      const font = fontToken ? fontByToken(preflight.fonts, fontToken) : undefined;
      if (!style || !font) throw new Error(`Unresolved source audit typography for ${templateId}/${layer.name}`);
      const baselineDeltaY = rasterBaselineDelta(layer, options.contracts.naverTypography);
      const before = drawTrackedTextWithRasterEvidence(createCanvas(NAVER_SMARTCHANNEL_CANVAS_WIDTH, template.height), sourceText, layer, font, parseFillColor(style.FillColor), style, 0);
      const after = drawTrackedTextWithRasterEvidence(createCanvas(NAVER_SMARTCHANNEL_CANVAS_WIDTH, template.height), sourceText, layer, font, parseFillColor(style.FillColor), style, baselineDeltaY);
      const sourcePixelBounds = numberArray(entry.pixelBounds);
      const sourceTop = sourcePixelBounds[1];
      rows.push({
        templateId,
        role: layer.role,
        sourceLayer: layer.name,
        sourceText,
        sourcePixelBounds,
        runtimeBoundsBefore: before.bounds,
        runtimeBoundsAfter: after.bounds,
        baselineDeltaY,
        topDeltaBefore: sourceTop !== undefined && before.bounds ? before.bounds.y - sourceTop : null,
        topDeltaAfter: sourceTop !== undefined && after.bounds ? after.bounds.y - sourceTop : null,
      });
    }
  }
  return { typographyTokenId, rows };
}

export function isSmartChannelRenderRequest(value: unknown): value is SmartChannelRenderRequest {
  const input = jsonObject(value);
  return input.channel === "NAVER_GFA" && input.placement === "SMARTCHANNEL";
}

export async function renderSmartChannel(requestValue: unknown, options: SmartChannelRenderOptions): Promise<SmartChannelRenderResult> {
  const { contracts } = options;
  const schemaValidation = new SchemaValidators(contracts).validateNaverInput(requestValue);
  if (!schemaValidation.valid) return failure(contracts, schemaValidation.issues);
  const shaped = validateInputShape(requestValue, contracts);
  if (!shaped.request) return failure(contracts, shaped.issues);
  const request = shaped.request;
  const templateRegistry = contracts.naverTemplateContract;
  const template = templates(templateRegistry).find((entry) => entry.templateId === request.templateId);
  if (!template) return failure(contracts, [...shaped.issues, issueFor(contracts, "NAVER_SMARTCHANNEL_TEMPLATE_UNKNOWN", "/templateId", "known registry template", request.templateId)]);
  const token = placementTokens(contracts.naverObjectPlacement).find((entry) => entry.token === template.objectPlacementToken);
  if (!token || !token.runtimeEnabled) return failure(contracts, [...shaped.issues, issueFor(contracts, "NAVER_SMARTCHANNEL_OBJECT_PLACEMENT_UNRESOLVED", "/templateId", "runtimeEnabled placement token", template.objectPlacementToken)]);
  const metadata = contracts.naverPsdMetadata;
  const contentIssues = validateTemplateContent(contracts, template, metadata, request.content);
  if (contentIssues.some(({ severity }) => severity === "ERROR")) return failure(contracts, [...shaped.issues, ...contentIssues]);
  const preflight = await preflightFonts(options.projectRoot, contracts, options.fontResourceProvider);
  const preIssues = [...shaped.issues, ...contentIssues, ...preflight.issues];
  let jobDirectory: string;
  try {
    jobDirectory = await resolveTrustedJobDirectory(options.outputRoot, request.output.directory, request.output.baseName);
  } catch (error) {
    return failure(contracts, [...preIssues, issueFor(contracts, "KBR-INPUT-009", "/output", "trusted output descendant", error instanceof Error ? error.message : String(error))]);
  }
  let objectAsset: Awaited<ReturnType<typeof verifiedAsset>>;
  try {
    objectAsset = await verifiedAsset(request.assets.object.path, request.assets.object.expectedSha256, contracts, options.inputRoot, "/assets/object/path");
  } catch (error) {
    return failure(contracts, [...preIssues, error as ValidationIssue]);
  }
  if (!objectAsset) return failure(contracts, [...preIssues, issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_MISSING", "/assets/object/path")]);
  const sourceRule = jsonArray(contracts.naverObjectPlacement.sourceAssetRules).find((entry) => String(entry.id) === token.sourceAssetRuleId);
  const expectedMime = stringArray(sourceRule?.acceptedMime);
  const expectedDimensions = requiredSourceDimensions(token, template.height);
  const actualDimensions = { width: objectAsset.image.width, height: objectAsset.image.height };
  const assetIssues: ValidationIssue[] = [];
  if (!expectedMime.includes(objectAsset.mime)) assetIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_MIME_INVALID", "/assets/object", expectedMime, objectAsset.mime));
  const expectedObjectRegion = normalizedPlacementFrame(token, template.height);
  const isLegacyPrecomposed = actualDimensions.width === expectedDimensions.width
    && actualDimensions.height === expectedDimensions.height
    && (token.placementPolicy === "PRECOMPOSED_CANVAS_1_TO_1" || token.coordinateSpace.type === "FULL_CANVAS_SOURCE");
  let objectRaster: SmartChannelObjectRaster;
  if (isLegacyPrecomposed) {
    const actualObjectBounds = transformedAlphaBounds(objectAsset.image, token);
    const sourceX = token.coordinateSpace.type === "SLOT_LOCAL_SOURCE" ? Number(token.placementFrame.x) : 0;
    const sourceY = token.coordinateSpace.type === "SLOT_LOCAL_SOURCE" ? Number(token.placementFrame.y ?? 0) : 0;
    const sourceAlpha = contentAlphaBounds(objectAsset.image);
    const legacyDiagnostics: SmartChannelObjectDiagnostics = {
      sourceCanvas: actualDimensions,
      alphaBounds: sourceAlpha,
      normalizedSize: { width: actualObjectBounds?.width ?? 0, height: actualObjectBounds?.height ?? 0, scale: 1 },
      finalBounds: actualObjectBounds,
      targetRegion: expectedObjectRegion,
      opaquePixelCount: countAlphaInside(objectAsset.image, sourceX, sourceY, expectedObjectRegion),
      maxOpaquePixelCount: NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS,
    };
    objectRaster = { image: objectAsset.image, destination: { x: sourceX, y: sourceY }, finalBounds: actualObjectBounds, diagnostics: legacyDiagnostics, legacyPrecomposed: true };
  } else {
    objectRaster = await normalizeSmartChannelObject(objectAsset.image, expectedObjectRegion);
  }
  const diagnostics = objectRaster.diagnostics;
  if (!diagnostics.alphaBounds) assetIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_MISSING", "/assets/object", "visible alpha object", diagnostics));
  if (diagnostics.normalizedSize.width > NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH
    || diagnostics.normalizedSize.height > NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT
    || (diagnostics.finalBounds !== null && (diagnostics.finalBounds.width > NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH || diagnostics.finalBounds.height > NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT))) {
    assetIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_ASSET_DIMENSION_MISMATCH", "/assets/object", {
      maxWidth: NAVER_SMARTCHANNEL_OBJECT_MAX_WIDTH,
      maxHeight: NAVER_SMARTCHANNEL_OBJECT_MAX_HEIGHT,
    }, diagnostics));
  }
  if (!containedBy(diagnostics.finalBounds, expectedObjectRegion)) assetIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_OBJECT_OUT_OF_REGION", "/assets/object", expectedObjectRegion, diagnostics));
  if (diagnostics.opaquePixelCount > NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS) assetIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_OBJECT_OPAQUE_PIXEL_LIMIT", "/assets/object", { maxOpaquePixelCount: NAVER_SMARTCHANNEL_OBJECT_MAX_OPAQUE_PIXELS }, diagnostics));
  if (assetIssues.length > 0 || preIssues.some(({ severity }) => severity === "ERROR")) return failure(contracts, [...preIssues, ...assetIssues]);

  const content = request.content;
  const canvas = createCanvas(NAVER_SMARTCHANNEL_CANVAS_WIDTH, template.height);
  if (objectRaster.legacyPrecomposed) drawSourceObject(canvas, objectAsset.image, token);
  else putImageData(canvas, objectRaster.image, objectRaster.destination.x, objectRaster.destination.y);
  const layers = visibleTextLayers(metadata, request.templateId);
  const textReports: SmartChannelTextRoleReport[] = [];
  const roleCounters = new Map<string, number>();
  const textIssues: ValidationIssue[] = [];
  for (const layer of layers) {
    const index = roleCounters.get(layer.role) ?? 0;
    roleCounters.set(layer.role, index + 1);
    const inputKey = layerInputKey(layer.role, index);
    const text = content[inputKey];
    if (!text) {
      textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_TEXT_REQUIRED", `/content/${inputKey}`, "text for visible source role", layer.name));
      continue;
    }
    if (/\r|\n|\t/u.test(text)) {
      textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/content/${inputKey}`, "single-line NFC text", text));
      continue;
    }
    const typography = typographyForLayer(layer, contracts.naverTypography);
    if (!typography) {
      textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/template/${request.templateId}/typographyTokenId`, "registered typography token", layer.typographyTokenId));
      continue;
    }
    const fontToken = sourceFontToToken(typography.fontNames[0] ?? "", contracts.naverFontCompatibility);
    if (!fontToken) {
      textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", `/content/${inputKey}`, "approved runtime typography font", typography.fontNames[0]));
      continue;
    }
    const font = fontByToken(preflight.fonts, fontToken);
    if (!font) continue;
    const style = typography.styleRuns[0];
    if (!style) {
      textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/template/${request.templateId}/typographyTokenId`, "typography token style run", layer.typographyTokenId));
      continue;
    }
    const baselineDeltaY = rasterBaselineDelta(layer, contracts.naverTypography);
    const textRaster = drawTrackedTextWithRasterEvidence(canvas, text, layer, font, parseFillColor(style.FillColor), style, baselineDeltaY);
    const width = textRaster.width;
    const overflowEvidence = horizontalOverflowEvidence(layer, textRaster);
    const overflow = overflowEvidence.overflow;
    if (overflow) textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_TEXT_OVERFLOW", `/content/${inputKey}`, { rightBoundary: overflowEvidence.rightBoundary, decisionBasis: overflowEvidence.decisionBasis }, { measuredWidth: width, actualRightEdge: overflowEvidence.actualRightEdge, clipped: overflowEvidence.clipped }, "POST_RENDER"));
    textReports.push({ role: layer.role, inputKey, text, sourceLayer: layer.name, typographyTokenId: String(layer.typographyTokenId ?? ""), box: { x: layer.textPlacement.boxX, y: layer.textPlacement.boxY, width: layer.textPlacement.boxWidth, height: layer.textPlacement.boxHeight }, expectedOrigin: { x: layer.textPlacement.originX, y: layer.textPlacement.baselineY }, actualRasterBounds: textRaster.bounds, baselineY: layer.textPlacement.baselineY, rasterBaselineY: layer.textPlacement.baselineY + baselineDeltaY, measuredWidth: width, horizontalOverflowEvidence: overflowEvidence, overflow });
  }

  const fixedComponents: SmartChannelReport["fixedComponents"] = [];
  const fixedRegistry = jsonArray(contracts.naverFixedComponents.components);
  if (template.affordance === "LANDING_ICON") {
    const componentId = template.height === 280 ? "LANDING_ICON_280" : "LANDING_ICON_COMPACT";
    const component = fixedRegistry.find((entry) => String(entry.id) === componentId);
    const asset = jsonObject(component?.asset);
    const placement = template.height === 280 ? jsonObject(component?.placement) : jsonObject(jsonObject(component?.heightPlacements)[String(template.height)]);
    const expectedBounds = {
      x: Number(placement.x),
      y: Number(placement.y),
      width: Number(placement.width),
      height: Number(placement.height),
    };
    if (!component || typeof asset.assetPath !== "string" || typeof asset.assetPngSha256 !== "string" || !Object.values(expectedBounds).every(Number.isFinite)) {
      textIssues.push(fixedComponentIssue(contracts, componentId, request.templateId, "MISSING_REGISTRY_ENTRY", typeof asset.assetPngSha256 === "string" ? asset.assetPngSha256 : null, null, Object.values(expectedBounds).every(Number.isFinite) ? expectedBounds : null, null, null, typeof asset.assetPath === "string" ? asset.assetPath : null, false, false, Boolean(component), false, false));
    } else {
      try {
        const fixed = await drawVerifiedFixedAsset(canvas, options.projectRoot, asset.assetPath, asset.assetPngSha256, expectedBounds, contracts, componentId, request.templateId);
        if (fixed) fixedComponents.push(fixed);
      } catch (error) { textIssues.push(error as ValidationIssue); }
    }
  }
  if (template.affordance === "APP_CTA") {
    const label = content.ctaOption;
    if (template.height === 160 || template.height === 200) {
      const compact = jsonObject(contracts.naverCtaOptions.compact160200);
      const allowedLabels = stringArray(compact.allowedLabels);
      const labelAssets = jsonObject(compact.labelAssets);
      const selected = label ? jsonObject(labelAssets[label]) : {};
      const sourceBounds = numberArray(selected.sourcePixelBounds);
      const placementY = Number(jsonObject(compact.placements)[String(template.height)] && jsonObject(jsonObject(compact.placements)[String(template.height)]).y);
      if (!label || !allowedLabels.includes(label) || typeof selected.assetPath !== "string" || typeof selected.assetPngSha256 !== "string" || sourceBounds.length < 4 || !Number.isFinite(placementY)) {
        textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "registered compact CTA label asset", label));
      } else {
        const expectedBounds = {
          x: Number(sourceBounds[0]),
          y: placementY,
          width: Number(sourceBounds[2] ?? 0) - Number(sourceBounds[0]),
          height: Number(sourceBounds[3] ?? 0) - Number(sourceBounds[1] ?? 0),
        };
        try {
          const fixed = await drawVerifiedFixedAsset(canvas, options.projectRoot, selected.assetPath, selected.assetPngSha256, expectedBounds, contracts, `APP_CTA_${template.height}_${label}`, request.templateId);
          if (fixed) fixedComponents.push(fixed);
        } catch (error) { textIssues.push(error as ValidationIssue); }
      }
    } else {
      const options280 = jsonArray(contracts.naverCtaOptions.options280);
      const option = label ? options280.find((entry) => String(entry.label) === label) : undefined;
      const occurrence = jsonArray(option?.sourceOccurrences).find((entry) => String(entry.templateId) === request.templateId);
      if (!label || !option || !occurrence) {
        textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "registered CTA option occurrence", label));
      } else {
        const button = jsonObject(occurrence.button);
        const chevron = jsonObject(occurrence.chevron);
        const buttonAsset = jsonObject(button.asset);
        const chevron280 = jsonObject(contracts.naverCtaOptions.chevron280);
        const chevronAsset = { ...chevron280, ...jsonObject(chevron.asset) };
        try {
          const buttonBounds = numberArray(button.visibleBounds);
          if (buttonBounds.length < 4 || typeof buttonAsset.assetPath !== "string" || typeof buttonAsset.assetPngSha256 !== "string") throw issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "button asset and visible bounds from CTA registry", occurrence.button);
          const buttonExpectedBounds = { x: Number(buttonBounds[0]), y: Number(buttonBounds[1]), width: Number(buttonBounds[2]) - Number(buttonBounds[0]), height: Number(buttonBounds[3]) - Number(buttonBounds[1]) };
          const buttonComponent = await drawVerifiedFixedAsset(canvas, options.projectRoot, buttonAsset.assetPath, buttonAsset.assetPngSha256, buttonExpectedBounds, contracts, `APP_CTA_280_BUTTON_${String(option.id)}`, request.templateId);
          if (buttonComponent) fixedComponents.push(buttonComponent);
          const chevronBounds = numberArray(chevron.visibleBounds).length >= 4 ? numberArray(chevron.visibleBounds) : numberArray(chevron280.visibleBounds);
          if (chevronBounds.length < 4 || typeof chevronAsset.assetPath !== "string" || typeof chevronAsset.assetPngSha256 !== "string") throw issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "chevron asset and visible bounds from CTA registry", occurrence.chevron);
          const chevronExpectedBounds = { x: Number(chevronBounds[0]), y: Number(chevronBounds[1]), width: Number(chevronBounds[2]) - Number(chevronBounds[0]), height: Number(chevronBounds[3]) - Number(chevronBounds[1]) };
          const chevronComponent = await drawVerifiedFixedAsset(canvas, options.projectRoot, chevronAsset.assetPath, chevronAsset.assetPngSha256, chevronExpectedBounds, contracts, "APP_CTA_280_CHEVRON", request.templateId);
          if (chevronComponent) fixedComponents.push(chevronComponent);
          const ctaLayer = ctaTextLayer(metadata, request.templateId, label);
          if (!ctaLayer) throw issueFor(contracts, "NAVER_SMARTCHANNEL_CTA_INVALID", "/content/ctaOption", "CTA label layer from PSD metadata", label);
          const ctaTypography = typographyForLayer(ctaLayer, contracts.naverTypography);
          if (!ctaTypography) throw issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/template/${request.templateId}/typographyTokenId`, "registered CTA typography token", ctaLayer.typographyTokenId);
          const ctaFontToken = sourceFontToToken(ctaTypography.fontNames[0] ?? "", contracts.naverFontCompatibility);
          const ctaFont = ctaFontToken ? fontByToken(preflight.fonts, ctaFontToken) : undefined;
          if (!ctaFont) throw issueFor(contracts, "NAVER_SMARTCHANNEL_FONT_UNAVAILABLE", "/content/ctaOption", "approved runtime CTA typography font", ctaTypography.fontNames[0]);
          const style = ctaTypography.styleRuns[0];
          if (!style) throw issueFor(contracts, "NAVER_SMARTCHANNEL_INPUT_INVALID", `/template/${request.templateId}/typographyTokenId`, "CTA typography token style run", ctaLayer.typographyTokenId);
          const ctaBaselineDeltaY = rasterBaselineDelta(ctaLayer, contracts.naverTypography);
          const ctaRaster = drawTrackedTextWithRasterEvidence(canvas, label, ctaLayer, ctaFont, parseFillColor(style.FillColor), style, ctaBaselineDeltaY);
          const ctaWidth = ctaRaster.width;
          const ctaOverflowEvidence = horizontalOverflowEvidence(ctaLayer, ctaRaster);
          const ctaOverflow = ctaOverflowEvidence.overflow;
          if (ctaOverflow) textIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_TEXT_OVERFLOW", "/content/ctaOption", { rightBoundary: ctaOverflowEvidence.rightBoundary, decisionBasis: ctaOverflowEvidence.decisionBasis }, { measuredWidth: ctaWidth, actualRightEdge: ctaOverflowEvidence.actualRightEdge, clipped: ctaOverflowEvidence.clipped }, "POST_RENDER"));
          textReports.push({ role: "CTA_LABEL", inputKey: "ctaOption", text: label, sourceLayer: ctaLayer.name, typographyTokenId: String(ctaLayer.typographyTokenId ?? ""), box: { x: ctaLayer.textPlacement.boxX, y: ctaLayer.textPlacement.boxY, width: ctaLayer.textPlacement.boxWidth, height: ctaLayer.textPlacement.boxHeight }, expectedOrigin: { x: ctaLayer.textPlacement.originX, y: ctaLayer.textPlacement.baselineY }, actualRasterBounds: ctaRaster.bounds, baselineY: ctaLayer.textPlacement.baselineY, rasterBaselineY: ctaLayer.textPlacement.baselineY + ctaBaselineDeltaY, measuredWidth: ctaWidth, horizontalOverflowEvidence: ctaOverflowEvidence, overflow: ctaOverflow });
        } catch (error) { textIssues.push(error as ValidationIssue); }
      }
    }
  }
  if (textIssues.some(({ severity }) => severity === "ERROR")) return failure(contracts, [...preIssues, ...assetIssues, ...textIssues]);

  const png = canvas.toBuffer("image/png");
  const pngDigest = sha256Bytes(png);
  const ihdr = inspectPngIhdr(png);
  const postIssues: ValidationIssue[] = [];
  if (!ihdr || ihdr.width !== NAVER_SMARTCHANNEL_CANVAS_WIDTH || ihdr.height !== template.height || ihdr.colorType !== 6 || ihdr.bitDepth !== 8) postIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_OUTPUT_INVALID", "/output.png", { width: NAVER_SMARTCHANNEL_CANVAS_WIDTH, height: template.height, colorType: 6, bitDepth: 8 }, ihdr ?? "invalid PNG", "POST_RENDER"));
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (raw.info.channels !== 4 || !Array.from(raw.data).some((_, index) => index % 4 === 3 && (raw.data[index] ?? 0) < 255)) {
    postIssues.push(issueFor(contracts, "NAVER_SMARTCHANNEL_OUTPUT_INVALID", "/output.png", "transparent RGBA PNG", "opaque or missing alpha", "POST_RENDER"));
  }
  if (postIssues.length > 0) return failure(contracts, [...preIssues, ...assetIssues, ...textIssues, ...postIssues], { png });

  const requestFingerprint = canonicalDigest(request);
  const fixedDigestInputs = fixedComponents.map((entry) => ({ id: entry.id, digest: entry.digest, x: entry.x, y: entry.y, width: entry.width, height: entry.height }));
  const objectFrame = expectedObjectRegion;
  const fontFingerprintMaterial = preflight.fonts.map((font) => ({ token: font.token, collectionAssetId: font.collectionAssetId, collectionDigest: font.collectionDigest, faceIndex: font.collectionFaceIndex, facePostScriptName: font.collectionFacePostScriptName, fontContractVersion: font.fontContractVersion }));
  const pixelFingerprint = canonicalDigest({ rendererPixelContract: "naver-smartchannel-raster-v1.1.0", encoderVersion: NAVER_SMARTCHANNEL_PNG_ENCODER_VERSION, assetNormalizationContract: "naver-smartchannel-asset-normalization-v1.0.0", templateContractVersion: String(templateRegistry.templateContractVersion), typographyRegistryVersion: String(contracts.naverTypography.registryVersion), templateId: request.templateId, objectPlacementToken: token.token, objectDigest: objectAsset.digest, objectFrame: token.placementFrame, objectDiagnostics: diagnostics, text: content, textMetadata: textReports.map((entry) => ({ role: entry.role, sourceLayer: entry.sourceLayer, typographyTokenId: entry.typographyTokenId, box: entry.box, baselineY: entry.baselineY, rasterBaselineY: entry.rasterBaselineY, actualRasterBounds: entry.actualRasterBounds, rightBoundary: entry.horizontalOverflowEvidence.rightBoundary })), fixedComponents: fixedDigestInputs, fonts: fontFingerprintMaterial });
  const renderFingerprint = pixelFingerprint;
  const report: SmartChannelReport = { templateId: request.templateId, objectPlacementToken: token.token, canvas: { width: NAVER_SMARTCHANNEL_CANVAS_WIDTH, height: template.height, format: "PNG", colorType: "RGBA", bitDepth: 8, hasAlpha: true }, object: { placementToken: token.token, expectedRegion: objectFrame, actualRasterBounds: diagnostics.finalBounds, sourceRuleId: token.sourceAssetRuleId, sourceMimeType: objectAsset.mime, sourceDigest: objectAsset.digest, frame: { x: objectFrame.x, y: objectFrame.y, width: diagnostics.normalizedSize.width, height: diagnostics.normalizedSize.height }, transform: token.coordinateSpace.type === "SMART_OBJECT_FRAME_SOURCE" ? "SOURCE_TRANSFORM" : "NONE", sourceCanvas: diagnostics.sourceCanvas, alphaBounds: diagnostics.alphaBounds, normalizedSize: diagnostics.normalizedSize, finalBounds: diagnostics.finalBounds, targetRegion: diagnostics.targetRegion, opaquePixelCount: diagnostics.opaquePixelCount, maxOpaquePixelCount: diagnostics.maxOpaquePixelCount }, textRoles: textReports, fixedComponents, fonts: preflight.fonts.map((font) => ({ token: font.token, runtimePostScriptName: font.runtimePostScriptName, digest: font.digest })), artifact: { pngDigest, bytes: png.byteLength } };
  const issueGroups = splitIssues(sortAndDedupeIssues([...preIssues, ...assetIssues, ...textIssues, ...postIssues]));
  const manifest: RenderManifest = {
    schemaVersion: "1.0.0",
    canonicalInputDigest: requestFingerprint,
    normalizedInputDigest: requestFingerprint,
    outputPngDigest: pngDigest,
    templateContractVersion: "1.9.0",
    inputSchemaVersion: "1.2.0",
    outputSchemaVersion: "2.0.0",
    validatorResult: { errorCount: 0, warningCount: issueGroups.warnings.length, infoCount: issueGroups.infos.length, issues: [...issueGroups.warnings, ...issueGroups.infos] },
    assetDigests: { product: { id: "NAVER_SMARTCHANNEL_OBJECT", sha256: objectAsset.digest }, fonts: preflight.fonts.map((font) => ({ id: font.token, sha256: font.collectionDigest })), approvedIcons: fixedComponents.map((entry) => ({ id: entry.id, sha256: entry.digest })), referenceFixture: { id: "NAVER_SMARTCHANNEL_TEMPLATE_CONTRACT", sha256: canonicalDigest(templateRegistry) }, images: [{ id: "NAVER_SMARTCHANNEL_OBJECT", sha256: objectAsset.digest }] },
    templateId: request.templateId,
    formatProfileId: NAVER_SMARTCHANNEL_FORMAT_PROFILE_ID,
    pixelFingerprint,
    requestFingerprint,
    renderFingerprint,
    smartChannelReport: report,
    manualAcceptanceStatus: { status: "NOT_REVIEWED", items: ["M-001", "M-002", "M-003", "M-004", "M-005", "M-006"].map((id) => ({ id, status: "NOT_REVIEWED" as const, reviewer: null, reviewedAt: null })) },
  };
  const manifestValidators: SchemaValidators = new SchemaValidators(contracts);
  manifestValidators.assertManifest(manifest);
  const manifestText = canonicalJson(manifest);
  const manifestDigest = sha256Bytes(Buffer.from(manifestText, "utf8"));
  const expectedManifestPath = path.join(jobDirectory, "render-manifest.json");
  const expectedPngPath = path.join(jobDirectory, "output.png");
  const response: SmartChannelRenderResult = { schemaVersion: "1.0.0", manifestDigest, pngDigest, manifestPath: expectedManifestPath, pngPath: expectedPngPath, downloadAllowed: options.publish !== false, status: "PASS", errors: [], warnings: issueGroups.warnings, formatProfileId: NAVER_SMARTCHANNEL_FORMAT_PROFILE_ID, templateId: request.templateId, objectPlacementToken: token.token, pixelFingerprint, requestFingerprint, renderFingerprint, artifactFormat: "PNG", artifactDigest: pngDigest, artifactPath: expectedPngPath, png, report };
  if (options.publish === false) return response;
  try {
    const published = await publishArtifacts({ outputRoot: options.outputRoot, jobDirectory, png, manifest: manifestText, overwrite: request.output.overwrite === true });
    return { ...response, manifestPath: published.manifestPath, pngPath: published.pngPath, artifactPath: published.artifactPath };
  } catch (error) {
    return failure(contracts, [...preIssues, ...assetIssues, ...textIssues, issueFor(contracts, error instanceof PublishError ? error.code : "KBR-SYSTEM-004", "/output", undefined, error instanceof Error ? error.message : String(error))]);
  }
}
