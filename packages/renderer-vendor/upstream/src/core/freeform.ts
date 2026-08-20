import { createCanvas, GlobalFonts, ImageData, type Canvas } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  applyCreativeLayoutPlanDefaults,
  computeFreeformFingerprints,
  guardCompositionDispatch,
  stableSortCreativeElements,
  validateFontReference,
  type CreativeElement,
  type CreativeLayoutPlan,
  type FormatProfile,
  type FreeformFontRegistry,
  type ImagePlacementSpec,
  type OutputFormat,
  type NormalizedRect,
  type RendererValidationIssue,
} from "@kbr/renderer-contract";
import sharp from "sharp";

import type { ContractBundle } from "./contracts.js";
import { loadContracts } from "./contracts.js";
import { canonicalJson } from "./canonical.js";
import { createIssue, sortAndDedupeIssues, splitIssues } from "./errors.js";
import { sha256Bytes, sha256File } from "./hash.js";
import {
  isReelsPlacementContext,
  resolveMetaPlacementContext,
} from "./meta-placement-context.js";
import { ImageInputError, inspectImageBytes } from "./image-input.js";
import {
  PathSecurityError,
  assertSafeRelativeReference,
  resolveTrustedInputFile,
  resolveTrustedJobDirectory,
} from "./path-security.js";
import { publishArtifacts, PublishError } from "./publish.js";
import { encodeFreeformArtifact, inspectPngIhdr, inspectRenderedArtifact, validateRenderedPng } from "./raster.js";
import { SchemaValidators } from "./schema-validation.js";
import {
  validateFreeformPostRender,
  validateFreeformPreRender,
  type FreeformAssetValidationMetadata,
} from "./freeform-validator.js";
import type { FreeformAppliedElement, RenderManifest, RenderResponse, ValidationIssue, ValidationStage } from "./types.js";

const FREEFORM_FONT_ALIAS_PREFIX = "KBR FREEFORM ";
const REGISTERED_FONTS = new Set<string>();

type FormatProfileRegistry = Readonly<{
  profiles?: readonly FormatProfile[];
  native1200?: FormatProfile;
}>;

type FreeformAssetValue = Readonly<{
  assetId?: string;
  path?: string;
  bytes?: Uint8Array;
  assetRef?: Readonly<{ type?: string; value?: string }>;
  mimeType?: string;
  declaredWidth?: number;
  declaredHeight?: number;
  checksumSha256?: string;
  expectedSha256?: string;
}>;

export type FreeformAssetInput = Readonly<{
  assetId: string;
  mimeType?: "image/png" | "image/jpeg";
  declaredWidth?: number;
  declaredHeight?: number;
  checksumSha256?: string;
  expectedSha256?: string;
  assetRef?: Readonly<{ type?: string; value?: string }>;
  path?: string;
  bytes?: Uint8Array;
}>;

export type FreeformRenderRequest = Readonly<{
  schemaVersion?: string;
  assetProfileId?: string;
  formatProfileId: string;
  layoutMode?: "FREEFORM";
  creativeLayoutPlan?: CreativeLayoutPlan;
  assets?: readonly FreeformAssetInput[] | Readonly<Record<string, FreeformAssetValue | string>>;
  output?: Readonly<{
    mimeType?: "image/png" | "image/jpeg";
    format?: OutputFormat;
    quality?: number | "AUTO_FIT";
    directory?: string;
    baseName?: string;
    overwrite?: boolean;
  }>;
  metaStatic?: Readonly<{
    mode?: "SINGLE" | "PLACEMENT_SET";
    placementContext?: string;
    conceptId?: string;
    variantId?: string;
    projectPixelPresetId?: string;
    platformCopy?: Readonly<{
      primaryText?: string;
      headline?: string;
      description?: string;
      callToAction?: string;
      destinationUrl?: string;
    }>;
    variants?: Readonly<Record<string, CreativeLayoutPlan>>;
  }>;
  placementSet?: Readonly<{
    conceptId?: string;
    sharedLayerIds?: readonly string[];
    variants: Readonly<Record<string, CreativeLayoutPlan | Readonly<{ creativeLayoutPlan: CreativeLayoutPlan; formatProfileId?: string; placementContext?: string }>>>;
  }>;
  platformCopy?: Readonly<{
    primaryText?: string;
    headline?: string;
    description?: string;
    callToAction?: string;
    destinationUrl?: string;
  }>;
  placementContext?: string;
  provenance?: Readonly<Record<string, unknown>>;
}>;

export type FreeformRenderOptions = Readonly<{
  projectRoot: string;
  inputRoot: string;
  outputRoot: string;
  contracts?: ContractBundle;
  publish?: boolean;
}>;

type InternalFreeformRenderOptions = FreeformRenderOptions & Readonly<{
  retainArtifactOnPostRenderError?: boolean;
}>;

export type FreeformRenderResult = Readonly<{
  status: "PASS" | "BLOCKED";
  png: Buffer | null;
  pngDigest: string | null;
  manifestDigest: string | null;
  manifestPath: string | null;
  pngPath: string | null;
  downloadAllowed: boolean;
  formatProfileId: string | null;
  artifactChecksumSha256: string | null;
  pixelFingerprint: string | null;
  requestFingerprint: string | null;
  renderFingerprint: string | null;
  artifactFormat: "PNG" | "JPEG" | null;
  artifactDigest: string | null;
  artifactPath: string | null;
  outputEncoding: NonNullable<RenderManifest["outputEncoding"]> | null;
  appliedElements: FreeformAppliedElement[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  metaStaticReport?: RenderManifest["metaStaticReport"];
  /** In-memory manifest used by Desktop Preview QA; never changes the public response envelope. */
  manifest?: RenderManifest | null;
}>;

type PixelRect = { x: number; y: number; width: number; height: number };
type RgbaImage = {
  bytes: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
  opaqueBackgroundSuspected: boolean;
};
type ResolvedAsset = {
  assetId: string;
  bytes: Buffer;
  digest: string;
  mimeType: "image/png" | "image/jpeg";
  image: RgbaImage;
  hasAlpha: boolean;
  visibleAlpha: boolean;
  opaqueBackgroundSuspected: boolean;
};
type RuntimeFreeformAssets = {
  fontRegistry: FreeformFontRegistry;
  fontDigests: Record<string, string>;
  fontPaths: Record<string, string>;
  referenceDigest: { id: string; sha256: string };
};

class FreeformAssetNotFoundError extends Error {
  constructor(reference: string) {
    super(`FREEFORM asset is unavailable: ${reference}`);
    this.name = "FreeformAssetNotFoundError";
  }
}

function emptyResult(
  errors: readonly ValidationIssue[],
  details: {
    formatProfileId?: string | null | undefined;
    pixelFingerprint?: string | null | undefined;
    requestFingerprint?: string | null | undefined;
  } = {},
): FreeformRenderResult {
  const sorted = sortAndDedupeIssues(errors);
  const { errors: errorIssues, warnings } = splitIssues(sorted);
  return {
    status: "BLOCKED",
    png: null,
    pngDigest: null,
    manifestDigest: null,
    manifestPath: null,
    pngPath: null,
    downloadAllowed: false,
    formatProfileId: details.formatProfileId ?? null,
    artifactChecksumSha256: null,
    pixelFingerprint: details.pixelFingerprint ?? null,
    requestFingerprint: details.requestFingerprint ?? null,
    renderFingerprint: details.pixelFingerprint ?? null,
    artifactFormat: null,
    artifactDigest: null,
    artifactPath: null,
    outputEncoding: null,
    appliedElements: [],
    errors: errorIssues,
    warnings,
    manifest: null,
  };
}

function publicOutputFailure(error: unknown): string {
  if (error instanceof PathSecurityError) return "path_security_violation";
  if (error instanceof PublishError) return error.code;
  return "publish_failed";
}

function issue(
  contracts: ContractBundle,
  code: string,
  pathValue: string,
  details: {
    expected?: unknown;
    actual?: unknown;
    elementId?: string | undefined;
    assetId?: string | undefined;
    bbox?: ValidationIssue["bbox"];
    stage?: ValidationStage;
    formatProfileId?: string | undefined;
  } = {},
): ValidationIssue {
  const created = createIssue(contracts.errorRegistry, code, pathValue, {
    ...details,
    ...(details.stage ? { stage: details.stage } : { stage: "PRE_RENDER" }),
  });
  if (details.elementId !== undefined) created.elementId = details.elementId;
  if (details.assetId !== undefined) created.assetId = details.assetId;
  if (details.formatProfileId !== undefined) created.formatProfileId = details.formatProfileId;
  return created;
}

function freeformIssuesToCore(contracts: ContractBundle, values: readonly RendererValidationIssue[]): ValidationIssue[] {
  return values.map((value) => {
    const pathValue = value.path ?? "/creativeLayoutPlan";
    return issue(contracts, value.code, pathValue, {
      ...(value.actual !== undefined ? { actual: value.actual } : {}),
      ...(value.expected !== undefined ? { expected: value.expected } : {}),
      ...(value.elementId !== undefined ? { elementId: value.elementId } : {}),
      ...(value.assetId !== undefined ? { assetId: value.assetId } : {}),
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNfc(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map((item) => normalizeNfc(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeNfc(item)]));
  return value;
}

export function isFreeformRenderRequest(value: unknown): value is FreeformRenderRequest {
  return isRecord(value) && value.layoutMode === "FREEFORM";
}

export function normalizedRectToPixelRect(
  rect: NormalizedRect,
  canvas: Readonly<{ width: number; height: number }>,
): PixelRect {
  const x = Math.floor(rect.x * canvas.width);
  const y = Math.floor(rect.y * canvas.height);
  const right = Math.ceil((rect.x + rect.width) * canvas.width);
  const bottom = Math.ceil((rect.y + rect.height) * canvas.height);
  return { x, y, width: right - x, height: bottom - y };
}

function parseColor(color: string): { red: number; green: number; blue: number; alpha: number } | null {
  const match = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/u.exec(color);
  if (!match) return null;
  const value = match[1];
  if (!value) return null;
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
    alpha: Number.parseInt(match[2] ?? "FF", 16) / 255,
  };
}

function rgbaCss(color: string): string {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Invalid canonical color: ${color}`);
  return `rgba(${parsed.red}, ${parsed.green}, ${parsed.blue}, ${parsed.alpha})`;
}

type AlphaData = Uint8Array | Uint8ClampedArray;

function alphaAt(data: AlphaData, index: number): number {
  return data[index * 4 + 3] ?? 0;
}

function alphaBox(data: AlphaData, width: number, height: number, threshold: number): PixelRect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(data, y * width + x) < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function opaqueBackgroundSuspected(data: AlphaData, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  if (!corners.every((index) => alphaAt(data, index) === 255)) return false;
  let solid = 0;
  for (let index = 0; index < width * height; index += 1) {
    if (alphaAt(data, index) >= 250) solid += 1;
  }
  return solid / (width * height) >= 0.95;
}

type Component = PixelRect & { count: number };

function visibleComponents(data: AlphaData, width: number, height: number): Component[] {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Component[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] === 1 || alphaAt(data, start) < 8) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (head < tail) {
      const current = queue[head++];
      if (current === undefined) break;
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] === 1 || alphaAt(data, next) < 8) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count });
  }
  return components;
}

function unionBoxes(boxes: readonly PixelRect[]): PixelRect {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function meaningfulAlphaBox(data: AlphaData, width: number, height: number): PixelRect | null {
  const visible = visibleComponents(data, width, height).sort(
    (left, right) => right.count - left.count || left.y - right.y || left.x - right.x,
  );
  const mainVisible = visible[0];
  if (!mainVisible) return null;
  // Trace at alpha >= 1 so anti-aliased fringe is retained, then discard
  // components that contain only a negligible layout-visible island.
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const selected: PixelRect[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] === 1 || alphaAt(data, start) < 1) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let count = 0;
    let visibleCount = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (head < tail) {
      const current = queue[head++];
      if (current === undefined) break;
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      if (alphaAt(data, current) >= 8) visibleCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] === 1 || alphaAt(data, next) < 1) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (visibleCount / mainVisible.count >= 0.0005 && count > 0) {
      selected.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }
  return selected.length > 0 ? unionBoxes(selected) : null;
}

function layoutVisibleAlphaBox(data: AlphaData, width: number, height: number): PixelRect | null {
  const components = visibleComponents(data, width, height).sort(
    (left, right) => right.count - left.count || left.y - right.y || left.x - right.x,
  );
  const main = components[0];
  if (!main) return null;
  const selected = components.filter((component) => component.count / main.count >= 0.0005);
  return selected.length > 0 ? unionBoxes(selected) : null;
}

function cropRectToPixels(rect: NormalizedRect, width: number, height: number): PixelRect | null {
  const crop = normalizedRectToPixelRect(rect, { width, height });
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > width || crop.y + crop.height > height) return null;
  if (crop.width < 1 || crop.height < 1) return null;
  return crop;
}

function anchorOffset(
  anchor: ImagePlacementSpec["anchor"],
  slot: PixelRect,
  width: number,
  height: number,
): { x: number; y: number } {
  const freeX = slot.width - width;
  const freeY = slot.height - height;
  const horizontal = anchor.endsWith("LEFT") || anchor === "TOP_LEFT" || anchor === "BOTTOM_LEFT"
    ? 0
    : anchor.endsWith("RIGHT") || anchor === "TOP_RIGHT" || anchor === "BOTTOM_RIGHT"
      ? freeX
      : Math.floor(freeX / 2);
  const vertical = anchor.startsWith("TOP") || anchor === "TOP_LEFT" || anchor === "TOP_RIGHT"
    ? 0
    : anchor.startsWith("BOTTOM") || anchor === "BOTTOM_LEFT" || anchor === "BOTTOM_RIGHT"
      ? freeY
      : Math.floor(freeY / 2);
  return { x: slot.x + horizontal, y: slot.y + vertical };
}

async function decodeRgba(bytes: Buffer): Promise<RgbaImage> {
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  const raw = await sharp(bytes, { failOn: "error" })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: raw.data,
    width: raw.info.width,
    height: raw.info.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    opaqueBackgroundSuspected: opaqueBackgroundSuspected(raw.data, raw.info.width, raw.info.height),
  };
}

async function resizeCrop(image: RgbaImage, crop: PixelRect, width: number, height: number): Promise<Buffer> {
  const extracted = await sharp(image.bytes, { raw: { width: image.width, height: image.height, channels: 4 } })
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
  return extracted;
}

function assetEntries(request: FreeformRenderRequest): Array<{ assetId: string; value: FreeformAssetValue }> {
  if (!request.assets) return [];
  if (Array.isArray(request.assets)) {
    return request.assets.map((asset) => ({ assetId: asset.assetId, value: asset }));
  }
  return Object.entries(request.assets).map(([assetId, value]) => ({
    assetId,
    value: typeof value === "string" ? { path: value } : value,
  }));
}

async function resolveAssetPath(
  value: string,
  kind: string | undefined,
  projectRoot: string,
  inputRoot: string,
): Promise<string> {
  assertSafeRelativeReference(value.replaceAll("\\", "/"));
  const candidates = kind === "FIXTURE_ASSET_ID"
    ? [projectRoot, inputRoot]
    : [inputRoot, projectRoot];
  for (const root of candidates) {
    const resolved = await resolveTrustedInputFile(root, value.replaceAll("\\", "/"));
    try {
      const inspected = await readFile(resolved);
      if (inspected.byteLength > 0) return resolved;
    } catch {
      // Try the next trusted root. No untrusted path is ever used.
    }
  }
  throw new FreeformAssetNotFoundError(value);
}

async function resolveAssets(
  request: FreeformRenderRequest,
  options: FreeformRenderOptions,
  contracts: ContractBundle,
): Promise<{ assets: Map<string, ResolvedAsset>; issues: ValidationIssue[] }> {
  const assets = new Map<string, ResolvedAsset>();
  const issues: ValidationIssue[] = [];
  for (const entry of assetEntries(request)) {
    if (assets.has(entry.assetId)) {
      issues.push(issue(contracts, "KBR-ASSET-NOT-FOUND", `/assets/${entry.assetId}`, { assetId: entry.assetId, actual: "duplicate assetId" }));
      continue;
    }
    const value = entry.value;
    try {
      let bytes: Buffer;
      if (value.bytes !== undefined) bytes = Buffer.from(value.bytes);
      else {
        const reference = value.path ?? value.assetRef?.value;
        if (!reference) {
          issues.push(issue(contracts, "KBR-FREEFORM-IMAGE-ASSET-NOT-FOUND", "/assets", { assetId: entry.assetId }));
          continue;
        }
        const filePath = await resolveAssetPath(reference, value.assetRef?.type, options.projectRoot, options.inputRoot);
        bytes = await readFile(filePath);
      }
      const inspected = await inspectImageBytes(bytes);
      const detectedMime = inspected.detectedMimeType;
      if (value.mimeType !== undefined && value.mimeType !== detectedMime) {
        issues.push(issue(contracts, "KBR-ASSET-MIME-EXTENSION-MISMATCH", `/assets/${entry.assetId}`, {
          actual: detectedMime,
          expected: value.mimeType,
          assetId: entry.assetId,
        }));
        continue;
      }
      const digest = sha256Bytes(bytes);
      const expectedDigest = value.checksumSha256 ?? value.expectedSha256;
      if (expectedDigest !== undefined && expectedDigest.toLowerCase() !== digest) {
        issues.push(issue(contracts, "KBR-ASSET-CHECKSUM-MISMATCH", `/assets/${entry.assetId}`, {
          actual: digest,
          expected: expectedDigest,
          assetId: entry.assetId,
        }));
        continue;
      }
      const decoded = await decodeRgba(bytes);
      if (value.declaredWidth !== undefined && value.declaredWidth !== decoded.width || value.declaredHeight !== undefined && value.declaredHeight !== decoded.height) {
        issues.push(issue(contracts, "KBR-ASSET-DIMENSION-MISMATCH", `/assets/${entry.assetId}`, {
          actual: { width: decoded.width, height: decoded.height },
          expected: { width: value.declaredWidth, height: value.declaredHeight },
          assetId: entry.assetId,
        }));
        continue;
      }
      assets.set(entry.assetId, {
        assetId: entry.assetId,
        bytes,
        digest,
        mimeType: detectedMime,
        image: decoded,
        hasAlpha: inspected.hasAlpha,
        visibleAlpha: alphaBox(decoded.bytes, decoded.width, decoded.height, 8) !== null,
        opaqueBackgroundSuspected: decoded.opaqueBackgroundSuspected,
      });
    } catch (error) {
      const code = error instanceof PathSecurityError
        ? "KBR-INPUT-009"
        : error instanceof FreeformAssetNotFoundError
          ? "KBR-FREEFORM-IMAGE-ASSET-NOT-FOUND"
          : error instanceof ImageInputError
            ? error.code
            : "KBR-IMAGE-DECODE-FAILED";
      const actual = error instanceof PathSecurityError
        ? "path_security_violation"
        : error instanceof FreeformAssetNotFoundError
          ? "asset_unavailable"
          : error instanceof ImageInputError
            ? "asset_input_invalid"
          : "image_decode_failed";
      issues.push(issue(contracts, code, `/assets/${entry.assetId}`, { assetId: entry.assetId, actual }));
    }
  }
  return { assets, issues };
}

async function loadRuntimeFreeformAssets(
  projectRoot: string,
  contracts: ContractBundle,
): Promise<{ runtime?: RuntimeFreeformAssets; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  const registryPath = path.join(projectRoot, "contracts", "freeform-font-registry.json");
  let fontRegistry: FreeformFontRegistry;
  try {
    fontRegistry = JSON.parse(await readFile(registryPath, "utf8")) as FreeformFontRegistry;
  } catch {
    return { issues: [issue(contracts, "KBR-SYSTEM-001", "/assets/fonts")] };
  }
  const fontDigests: Record<string, string> = {};
  const fontPaths: Record<string, string> = {};
  for (const entry of fontRegistry.entries) {
    const referenceIssues = validateFontReference(entry.fontId, fontRegistry, `/assets/fonts/${entry.fontId}`);
    issues.push(...freeformIssuesToCore(contracts, referenceIssues));
    if (referenceIssues.length > 0 || entry.status !== "RESOLVED_ASSET") continue;
    try {
      assertSafeRelativeReference(entry.assetPath);
      const filePath = path.resolve(projectRoot, ...entry.assetPath.split("/"));
      const digest = await sha256File(filePath);
      if (digest !== entry.sha256.toLowerCase()) {
        issues.push(issue(contracts, "KBR-FONT-ASSET-DIGEST-MISMATCH", `/assets/fonts/${entry.fontId}`, { actual: digest, expected: entry.sha256 }));
        continue;
      }
      fontDigests[entry.fontId] = digest;
      fontPaths[entry.fontId] = filePath;
      const alias = `${FREEFORM_FONT_ALIAS_PREFIX}${entry.fontId}`;
      if (!REGISTERED_FONTS.has(alias)) {
        const result = GlobalFonts.registerFromPath(filePath, alias);
        if (result === null) {
          issues.push(issue(contracts, "KBR-SYSTEM-003", `/assets/fonts/${entry.fontId}`));
          continue;
        }
        REGISTERED_FONTS.add(alias);
      }
    } catch {
      issues.push(issue(contracts, "KBR-FONT-ASSET-MISSING", `/assets/fonts/${entry.fontId}`, { actual: entry.assetPath }));
    }
  }
  try {
    const referencePath = path.join(projectRoot, ...contracts.referenceRegistry.fixture.path.split("/"));
    const digest = await sha256File(referencePath);
    if (digest !== contracts.referenceRegistry.fixture.sha256) {
      issues.push(issue(contracts, "KBR-ASSET-007", "/referenceFixture", { actual: digest, expected: contracts.referenceRegistry.fixture.sha256 }));
    }
    return issues.length > 0
      ? { issues: sortAndDedupeIssues(issues) }
      : {
          runtime: {
            fontRegistry,
            fontDigests,
            fontPaths,
            referenceDigest: { id: contracts.referenceRegistry.fixture.id, sha256: digest },
          },
          issues,
        };
  } catch {
    issues.push(issue(contracts, "KBR-ASSET-001", "/referenceFixture"));
    return { issues: sortAndDedupeIssues(issues) };
  }
}

function applyPlacementCrop(
  placement: ImagePlacementSpec,
  image: RgbaImage,
  elementId: string,
  contracts: ContractBundle,
  targetRatio = 1,
): { crop: PixelRect; alphaTrimApplied: boolean; errors: ValidationIssue[]; requestedCrop?: NormalizedRect } {
  const errors: ValidationIssue[] = [];
  let requestedCrop: NormalizedRect | undefined;
  if (placement.policy === "ALPHA_TRIM_CONTAIN") {
    const meaningful = meaningfulAlphaBox(image.bytes, image.width, image.height);
    if (!meaningful) {
      errors.push(issue(contracts, "KBR-ASSET-005", `/elements/${elementId}/placement`, { elementId, stage: "POST_RENDER" }));
      return { crop: { x: 0, y: 0, width: 1, height: 1 }, alphaTrimApplied: true, errors };
    }
    return { crop: meaningful, alphaTrimApplied: true, errors };
  }
  if (placement.policy === "CENTER_CONTAIN") return { crop: { x: 0, y: 0, width: image.width, height: image.height }, alphaTrimApplied: false, errors };
  if (placement.cropRect !== undefined) {
    requestedCrop = placement.cropRect;
    const crop = cropRectToPixels(placement.cropRect, image.width, image.height);
    if (!crop) errors.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `/elements/${elementId}/placement/cropRect`, { elementId, stage: "POST_RENDER" }));
    return { crop: crop ?? { x: 0, y: 0, width: 1, height: 1 }, alphaTrimApplied: false, errors, ...(requestedCrop ? { requestedCrop } : {}) };
  }
  if (placement.policy === "MANUAL_CROP") {
    errors.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `/elements/${elementId}/placement/cropRect`, { elementId, expected: "cropRect", stage: "POST_RENDER" }));
    return { crop: { x: 0, y: 0, width: 1, height: 1 }, alphaTrimApplied: false, errors };
  }
  if (placement.policy === "SEMANTIC_CROP_COVER" && placement.focalPoint !== undefined) {
    const sourceRatio = image.width / image.height;
    let cropWidth = 1;
    let cropHeight = 1;
    if (sourceRatio > targetRatio) cropWidth = targetRatio / sourceRatio;
    else cropHeight = sourceRatio / targetRatio;
    const left = Math.min(1 - cropWidth, Math.max(0, placement.focalPoint.x - cropWidth / 2));
    const top = Math.min(1 - cropHeight, Math.max(0, placement.focalPoint.y - cropHeight / 2));
    const derived: NormalizedRect = { x: left, y: top, width: cropWidth, height: cropHeight };
    const crop = cropRectToPixels(derived, image.width, image.height);
    if (!crop) errors.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `/elements/${elementId}/placement/focalPoint`, { elementId, stage: "POST_RENDER" }));
    return { crop: crop ?? { x: 0, y: 0, width: 1, height: 1 }, alphaTrimApplied: false, errors };
  }
  errors.push(issue(contracts, "KBR-FREEFORM-IMAGE-PLACEMENT-INVALID", `/elements/${elementId}/placement/cropRect`, { elementId, expected: "cropRect or focalPoint", stage: "POST_RENDER" }));
  return { crop: { x: 0, y: 0, width: 1, height: 1 }, alphaTrimApplied: false, errors };
}

async function renderImageElement(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  asset: ResolvedAsset,
  element: Extract<CreativeElement, { type: "IMAGE" | "LOGO" }>,
  slot: PixelRect,
  contracts: ContractBundle,
  elementIndex: number,
): Promise<{ applied?: FreeformAppliedElement; errors: ValidationIssue[] }> {
  const placement = applyPlacementCrop(element.placement, asset.image, element.id, contracts, slot.width / slot.height);
  if (placement.errors.length > 0) return { errors: placement.errors };
  const crop = placement.crop;
  const cover = element.placement.fitMode === "COVER" || element.placement.policy === "SEMANTIC_CROP_COVER";
  const scale = cover
    ? Math.max(slot.width / crop.width, slot.height / crop.height)
    : Math.min(slot.width / crop.width, slot.height / crop.height);
  const resizedWidth = Math.max(1, Math.round(crop.width * scale));
  const resizedHeight = Math.max(1, Math.round(crop.height * scale));
  const destination = cover
    ? { x: slot.x, y: slot.y }
    : anchorOffset(element.placement.anchor, slot, resizedWidth, resizedHeight);
  const resizedRgba = await resizeCrop(asset.image, crop, resizedWidth, resizedHeight);
  // Capture the post-resize layout-visible (alpha>=8) bounds without changing
  // the source asset.  The component rule prevents a tiny isolated island
  // from expanding the layout bbox.
  const resizedVisible = layoutVisibleAlphaBox(resizedRgba, resizedWidth, resizedHeight)
    ?? alphaBox(resizedRgba, resizedWidth, resizedHeight, 8);
  const resizedCanvas = createCanvas(resizedWidth, resizedHeight);
  resizedCanvas.getContext("2d").putImageData(
    new ImageData(new Uint8ClampedArray(resizedRgba.buffer, resizedRgba.byteOffset, resizedRgba.byteLength), resizedWidth, resizedHeight),
    0,
    0,
  );
  context.save();
  context.globalAlpha = element.opacity ?? 1;
  if (cover) {
    context.beginPath();
    context.rect(slot.x, slot.y, slot.width, slot.height);
    context.clip();
  }
  context.drawImage(resizedCanvas, destination.x, destination.y, resizedWidth, resizedHeight);
  context.restore();
  const rasterBounds = resizedVisible
    ? {
        x: destination.x + resizedVisible.x,
        y: destination.y + resizedVisible.y,
        width: resizedVisible.width,
        height: resizedVisible.height,
      }
    : undefined;
  const clippedRasterBounds = rasterBounds && cover
    ? (() => {
        const left = Math.max(slot.x, rasterBounds.x);
        const top = Math.max(slot.y, rasterBounds.y);
        const right = Math.min(slot.x + slot.width, rasterBounds.x + rasterBounds.width);
        const bottom = Math.min(slot.y + slot.height, rasterBounds.y + rasterBounds.height);
        return right > left && bottom > top
          ? { x: left, y: top, width: right - left, height: bottom - top }
          : undefined;
      })()
    : rasterBounds;
  return {
    applied: {
      elementId: element.id,
      elementType: element.type,
      normalizedBounds: element.bounds,
      destinationPixelRect: cover ? slot : { x: destination.x, y: destination.y, width: resizedWidth, height: resizedHeight },
      zIndex: element.zIndex,
      originalArrayIndex: elementIndex,
      opacity: element.opacity ?? 1,
      assetId: element.assetId,
      assetDigest: asset.digest,
      ...(clippedRasterBounds ? { actualRasterBounds: clippedRasterBounds } : {}),
      placementPolicy: element.placement.policy,
      fitMode: element.placement.fitMode,
      ...(placement.requestedCrop ? { requestedCropRect: placement.requestedCrop } : {}),
      ...(placement.alphaTrimApplied || element.placement.policy !== "CENTER_CONTAIN" ? { resolvedSourceCropPixels: crop } : {}),
    },
    errors: [],
  };
}

function scanVisibleCanvas(canvas: Canvas, width: number, height: number): PixelRect | null {
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  return alphaBox(data, width, height, 8);
}

function drawSpacedText(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  x: number,
  baseline: number,
  letterSpacing: number,
): void {
  if (letterSpacing === 0) {
    context.fillText(text, x, baseline);
    return;
  }
  let cursor = x;
  for (const glyph of Array.from(text)) {
    context.fillText(glyph, cursor, baseline);
    cursor += context.measureText(glyph).width + letterSpacing;
  }
}

function lineWidth(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  letterSpacing: number,
): number {
  if (letterSpacing === 0) return context.measureText(text).width;
  const glyphs = Array.from(text);
  return glyphs.reduce((sum, glyph) => sum + context.measureText(glyph).width, 0) + Math.max(0, glyphs.length - 1) * letterSpacing;
}

function renderTextElement(
  mainContext: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  element: Extract<CreativeElement, { type: "TEXT" }>,
  slot: PixelRect,
  canvasSize: Readonly<{ width: number; height: number }>,
  fontAlias: string,
  contracts: ContractBundle,
  elementIndex: number,
): { applied?: FreeformAppliedElement; errors: ValidationIssue[] } {
  const lines = element.wrapMode === "EXPLICIT_NEWLINES" ? element.text.split("\n") : [element.text];
  const isolated = createCanvas(canvasSize.width, canvasSize.height);
  const context = isolated.getContext("2d");
  context.textBaseline = "alphabetic";
  context.font = `${element.fontSizePx}px "${fontAlias}"`;
  context.fillStyle = rgbaCss(element.color);
  // Napi Canvas exposes font metrics for diagnostics, but its bitmap ascent can
  // vary by glyph run. A font-size baseline offset keeps the contract's pixel
  // bounds deterministic for all pinned Spoqa glyphs without auto-shrinking.
  const ascent = element.fontSizePx;
  const totalHeight = element.lineHeightPx * lines.length;
  const top = element.verticalAlign === "TOP"
    ? slot.y
    : element.verticalAlign === "BOTTOM"
      ? slot.y + slot.height - totalHeight
      : slot.y + Math.floor((slot.height - totalHeight) / 2);
  const letterSpacing = element.letterSpacingPx ?? 0;
  lines.forEach((line, lineIndex) => {
    const width = lineWidth(context, line, letterSpacing);
    const x = element.textAlign === "LEFT"
      ? slot.x
      : element.textAlign === "RIGHT"
        ? slot.x + slot.width - width
        : slot.x + Math.floor((slot.width - width) / 2);
    drawSpacedText(context, line, x, top + ascent + lineIndex * element.lineHeightPx, letterSpacing);
  });
  const visible = scanVisibleCanvas(isolated, canvasSize.width, canvasSize.height);
  const errors: ValidationIssue[] = [];
  let overflowDetected = false;
  let clipped = false;
  if (!visible) errors.push(issue(contracts, "KBR-FREEFORM-TEXT-OVERFLOW", `/elements/${element.id}`, { elementId: element.id, expected: "visible glyphs", actual: "none", stage: "POST_RENDER" }));
  else {
    const outside = visible.x < slot.x || visible.y < slot.y || visible.x + visible.width > slot.x + slot.width || visible.y + visible.height > slot.y + slot.height;
    overflowDetected = outside;
    if (outside && element.overflowMode === "ERROR") {
      errors.push(issue(contracts, "KBR-FREEFORM-TEXT-OVERFLOW", `/elements/${element.id}/bounds`, { elementId: element.id, bbox: visible, expected: slot, stage: "POST_RENDER" }));
    }
    clipped = outside && element.overflowMode === "CLIP";
  }
  if (errors.length > 0) return { errors };
  const appliedVisible = visible && element.overflowMode === "CLIP"
    ? (() => {
        const left = Math.max(slot.x, visible.x);
        const top = Math.max(slot.y, visible.y);
        const right = Math.min(slot.x + slot.width, visible.x + visible.width);
        const bottom = Math.min(slot.y + slot.height, visible.y + visible.height);
        return right > left && bottom > top
          ? { x: left, y: top, width: right - left, height: bottom - top }
          : undefined;
      })()
    : visible;
  mainContext.save();
  mainContext.globalAlpha = element.opacity ?? 1;
  if (element.overflowMode === "CLIP") {
    mainContext.beginPath();
    mainContext.rect(slot.x, slot.y, slot.width, slot.height);
    mainContext.clip();
  }
  mainContext.drawImage(isolated as never, 0, 0);
  mainContext.restore();
  return {
    applied: {
      elementId: element.id,
      elementType: element.type,
      normalizedBounds: element.bounds,
      destinationPixelRect: slot,
      zIndex: element.zIndex,
      originalArrayIndex: elementIndex,
      opacity: element.opacity ?? 1,
      fontId: element.fontId,
      fontSizePx: element.fontSizePx,
      lineHeightPx: element.lineHeightPx,
      color: element.color,
      ...(element.safeZoneImportance ? { safeZoneImportance: element.safeZoneImportance } : {}),
      wrapMode: element.wrapMode,
      overflowMode: element.overflowMode,
      overflowDetected,
      clipped,
      ...(appliedVisible ? { actualRasterBounds: appliedVisible } : {}),
    },
    errors,
  };
}

function renderShapeElement(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  element: Extract<CreativeElement, { type: "SHAPE" }>,
  slot: PixelRect,
  contracts: ContractBundle,
  elementIndex: number,
): { applied?: FreeformAppliedElement; errors: ValidationIssue[] } {
  try {
    context.save();
    context.globalAlpha = element.opacity ?? 1;
    context.fillStyle = rgbaCss(element.fillColor);
    if (element.shape === "ELLIPSE") {
      context.beginPath();
      context.ellipse(slot.x + slot.width / 2, slot.y + slot.height / 2, slot.width / 2, slot.height / 2, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(slot.x, slot.y, slot.width, slot.height);
    }
    context.restore();
    return {
      applied: {
        elementId: element.id,
        elementType: "SHAPE",
        normalizedBounds: element.bounds,
        destinationPixelRect: slot,
        actualRasterBounds: slot,
        zIndex: element.zIndex,
        originalArrayIndex: elementIndex,
        opacity: element.opacity ?? 1,
        ...(element.safeZoneImportance ? { safeZoneImportance: element.safeZoneImportance } : {}),
      },
      errors: [],
    };
  } catch (error) {
    return {
      errors: [issue(contracts, "KBR-SYSTEM-003", `/elements/${elementIndex}`, {
        elementId: element.id,
        actual: error instanceof Error ? error.message : "shape rasterization failed",
        stage: "POST_RENDER",
      })],
    };
  }
}

function manifestAcceptanceStatus(): RenderManifest["manualAcceptanceStatus"] {
  return {
    status: "NOT_REVIEWED",
    items: ["M-001", "M-002", "M-003", "M-004", "M-005", "M-006"].map((id) => ({
      id,
      status: "NOT_REVIEWED" as const,
      reviewer: null,
      reviewedAt: null,
    })),
  };
}

function defaultOutput(request: FreeformRenderRequest): { directory: string; baseName: string; overwrite: boolean } {
  return {
    directory: request.output?.directory ?? "freeform",
    baseName: request.output?.baseName ?? "render",
    overwrite: request.output?.overwrite ?? false,
  };
}

function requestedFreeformOutputFormat(request: FreeformRenderRequest): "PNG" | "JPEG" {
  const output = request.output;
  if (output?.format === "JPEG" || output?.format === "JPG" || output?.mimeType === "image/jpeg") return "JPEG";
  return "PNG";
}

function freeformArtifactFileName(format: "PNG" | "JPEG"): string {
  return format === "JPEG" ? "output.jpg" : "output.png";
}

async function validateFreeformArtifact(
  artifact: Buffer,
  format: "PNG" | "JPEG",
  profile: FormatProfile,
  contracts: ContractBundle,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const inspected = await inspectRenderedArtifact(artifact, format, profile.canvas);
  const pathValue = format === "JPEG" ? "/output.jpg" : "/output.png";
  if (!inspected.metadata || inspected.width !== profile.canvas.width || inspected.height !== profile.canvas.height || inspected.metadata.format !== (format === "JPEG" ? "jpeg" : "png")) {
    issues.push(issue(contracts, "KBR-OUTPUT-003", pathValue, {
      expected: { format, width: profile.canvas.width, height: profile.canvas.height },
      actual: { format: inspected.metadata?.format, width: inspected.width, height: inspected.height },
      stage: "POST_RENDER",
    }));
  }
  if (format === "PNG") {
    const ihdr = inspectPngIhdr(artifact);
    if (!ihdr || ihdr.bitDepth !== 8 || ihdr.colorType !== 6) {
      issues.push(issue(contracts, "KBR-OUTPUT-003", pathValue, {
        expected: { format: "PNG", bitDepth: 8, colorType: 6 },
        actual: ihdr ? { bitDepth: ihdr.bitDepth, colorType: ihdr.colorType } : "invalid PNG IHDR",
        stage: "POST_RENDER",
      }));
    }
  }
  const constraints = profile.outputConstraints;
  if (constraints?.minimumBytes !== undefined) {
    const meetsMinimum = constraints.minimumBytesComparator === "GT"
      ? artifact.byteLength > constraints.minimumBytes
      : artifact.byteLength >= constraints.minimumBytes;
    if (!meetsMinimum) {
      issues.push(issue(contracts, "KBR-FREEFORM-FILE-SIZE-BELOW-MINIMUM", pathValue, {
        expected: { minimumBytes: constraints.minimumBytes, comparator: constraints.minimumBytesComparator ?? "GTE" },
        actual: { bytes: artifact.byteLength },
        formatProfileId: profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
  }
  if (constraints?.maximumBytes !== undefined) {
    const withinLimit = constraints.maximumBytesComparator === "LT"
      ? artifact.byteLength < constraints.maximumBytes
      : artifact.byteLength <= constraints.maximumBytes;
    if (!withinLimit) {
      issues.push(issue(contracts, "KBR-FREEFORM-FILE-SIZE-EXCEEDED", pathValue, {
        expected: { maximumBytes: constraints.maximumBytes, comparator: constraints.maximumBytesComparator ?? "LTE" },
        actual: { bytes: artifact.byteLength },
        formatProfileId: profile.formatProfileId,
        stage: "POST_RENDER",
      }));
    }
  }
  if (constraints?.requiresOpaqueOutput === true && !inspected.opaque) {
    issues.push(issue(contracts, "KBR-FREEFORM-OPAQUE-OUTPUT-REQUIRED", pathValue, {
      expected: "all final pixels alpha=255",
      actual: { hasAlpha: inspected.hasAlpha, opaque: inspected.opaque },
      formatProfileId: profile.formatProfileId,
      stage: "POST_RENDER",
    }));
  }
  return issues;
}

function freeformResponseFromResult(result: FreeformRenderResult): RenderResponse {
  return {
    schemaVersion: "1.0.0",
    manifestDigest: result.manifestDigest,
    pngDigest: result.pngDigest,
    manifestPath: result.manifestPath,
    pngPath: result.pngPath,
    downloadAllowed: result.downloadAllowed,
    status: result.status === "PASS" ? "PASS" : "FAIL",
    errors: result.errors,
    warnings: result.warnings,
    ...(result.formatProfileId ? { formatProfileId: result.formatProfileId } : {}),
    ...(result.artifactChecksumSha256 ? { artifactChecksumSha256: result.artifactChecksumSha256 } : {}),
    ...(result.pixelFingerprint ? { pixelFingerprint: result.pixelFingerprint } : {}),
    ...(result.requestFingerprint ? { requestFingerprint: result.requestFingerprint } : {}),
    ...(result.renderFingerprint ? { renderFingerprint: result.renderFingerprint } : {}),
    ...(result.artifactFormat ? { artifactFormat: result.artifactFormat } : {}),
    artifactDigest: result.artifactDigest,
    artifactPath: result.artifactPath,
    ...(result.outputEncoding ? { outputEncoding: result.outputEncoding } : {}),
    appliedElements: result.appliedElements,
    ...(result.metaStaticReport ? { metaStaticReport: result.metaStaticReport } : {}),
  };
}

export { freeformResponseFromResult };

async function renderFreeformInternal(
  request: FreeformRenderRequest,
  options: InternalFreeformRenderOptions,
): Promise<FreeformRenderResult> {
  const contracts = options.contracts ?? await loadContracts(options.projectRoot);
  const rawRequest: unknown = request;
  const formatProfileId = isRecord(rawRequest) && typeof rawRequest.formatProfileId === "string" ? rawRequest.formatProfileId : undefined;
  const profileRegistryPath = path.join(options.projectRoot, "contracts", "freeform-format-profiles.json");
  let profileRegistry: FormatProfileRegistry;
  try {
    profileRegistry = JSON.parse(await readFile(profileRegistryPath, "utf8")) as FormatProfileRegistry;
  } catch {
    return emptyResult([issue(contracts, "KBR-FREEFORM-FORMAT-PROFILE-NOT-FOUND", "/formatProfileId", { actual: formatProfileId, formatProfileId })], { formatProfileId });
  }
  const profile = profileRegistry.profiles?.find((candidate) => candidate.formatProfileId === formatProfileId);
  const compositionGuard = profile ? guardCompositionDispatch({ compositionMode: profile.compositionMode ?? "RENDERER_COMPOSED" }) : null;
  if (compositionGuard && !compositionGuard.allowed) {
    return emptyResult([issue(contracts, compositionGuard.code, "/compositionMode", { actual: profile?.compositionMode, formatProfileId })], {
      formatProfileId,
    });
  }
  const runtimeResult = await loadRuntimeFreeformAssets(options.projectRoot, contracts);
  const preValidationIssues = validateFreeformPreRender(rawRequest, {
    contracts,
    ...(profile ? { formatProfile: profile } : {}),
    ...(runtimeResult.runtime ? { fontRegistry: runtimeResult.runtime.fontRegistry } : {}),
  });
  const metaPlacementContext = resolveMetaPlacementContext(rawRequest);
  const metaStaticContext = metaPlacementContext.resolved ?? undefined;
  const metaInfoIssues = profile?.channelNamespace === "META" && isReelsPlacementContext(metaStaticContext)
    ? [issue(contracts, "KBR-META-REELS-SAFE-ZONE-SOURCE-REQUIRED", metaPlacementContext.path ?? "/placementContext", {
      actual: metaStaticContext,
      expected: "source-backed exact Reels safe-zone geometry; no guessed coordinates",
      formatProfileId,
    })]
    : [];
  const initialIssues = sortAndDedupeIssues([...preValidationIssues, ...runtimeResult.issues, ...metaInfoIssues]);
  const runtimeAssets = runtimeResult.runtime;
  if (initialIssues.some((entry) => entry.severity === "ERROR") || !profile || !runtimeAssets) {
    return emptyResult(initialIssues.length > 0 ? initialIssues : [issue(contracts, "KBR-SYSTEM-001", "/assets")], {
      formatProfileId,
    });
  }
  const creativeLayoutPlan = isRecord(rawRequest) && rawRequest.creativeLayoutPlan !== undefined
    ? rawRequest.creativeLayoutPlan as CreativeLayoutPlan
    : undefined;
  if (!creativeLayoutPlan) return emptyResult([issue(contracts, "KBR-FREEFORM-PLAN-MISSING", "/creativeLayoutPlan")], { formatProfileId: formatProfileId ?? null });
  const defaults = normalizeNfc(applyCreativeLayoutPlanDefaults(creativeLayoutPlan)) as CreativeLayoutPlan;
  const resolvedAssetsResult = await resolveAssets(request, options, contracts);
  const assetValidationMetadata = new Map<string, FreeformAssetValidationMetadata>(
    [...resolvedAssetsResult.assets.values()].map((asset) => [asset.assetId, {
      assetId: asset.assetId,
      digest: asset.digest,
      mimeType: asset.mimeType,
      width: asset.image.width,
      height: asset.image.height,
      bytes: asset.bytes.byteLength,
      hasAlpha: asset.hasAlpha,
      visibleAlpha: asset.visibleAlpha,
      opaqueBackgroundSuspected: asset.opaqueBackgroundSuspected,
    }]),
  );
  const resolvedValidationIssues = validateFreeformPreRender(rawRequest, {
    contracts,
    formatProfile: profile,
    fontRegistry: runtimeAssets.fontRegistry,
    resolvedAssets: assetValidationMetadata,
  });
  const allIssues = sortAndDedupeIssues([
    ...initialIssues,
    ...resolvedAssetsResult.issues,
    ...resolvedValidationIssues,
  ]);
  if (allIssues.some((entry) => entry.severity === "ERROR")) {
    return emptyResult(allIssues, { formatProfileId });
  }
  const assetDigests: Record<string, string> = { ...runtimeAssets.fontDigests };
  for (const asset of resolvedAssetsResult.assets.values()) assetDigests[asset.assetId] = asset.digest;
  const requestedFormat = requestedFreeformOutputFormat(request);
  const profilePixelPresetId = profile.complianceMetadata && isRecord(profile.complianceMetadata) && typeof profile.complianceMetadata.pixelPresetId === "string"
    ? profile.complianceMetadata.pixelPresetId
    : null;
  const requestProvenance = {
    ...(request.provenance ?? {}),
    outputEncodingRequest: {
      format: requestedFormat,
      quality: request.output?.quality ?? (requestedFormat === "JPEG" ? "AUTO_FIT" : null),
    },
    assetReferences: assetEntries(request)
      .sort((left, right) => left.assetId.localeCompare(right.assetId, "en"))
      .map(({ assetId, value }) => ({
        assetId,
        ...(value.path ? { path: value.path.replaceAll("\\", "/") } : {}),
        ...(value.assetRef ? { assetRef: value.assetRef } : {}),
        ...(value.mimeType ? { mimeType: value.mimeType } : {}),
        ...(value.checksumSha256 ? { checksumSha256: value.checksumSha256 } : {}),
        ...(value.expectedSha256 ? { expectedSha256: value.expectedSha256 } : {}),
      })),
    assetDigests,
    ...(profile.channelNamespace === "META" ? {
      metaStatic: {
        mode: isRecord(request.metaStatic) && request.metaStatic.mode === "PLACEMENT_SET" ? "PLACEMENT_SET" : "SINGLE",
        placementContext: metaPlacementContext.resolved,
        placementContextResolution: {
          requested: metaPlacementContext.requested,
          resolved: metaPlacementContext.resolved,
          source: metaPlacementContext.source,
          path: metaPlacementContext.path,
        },
        conceptId: isRecord(request.metaStatic) && typeof request.metaStatic.conceptId === "string" ? request.metaStatic.conceptId : null,
        variantId: isRecord(request.metaStatic) && typeof request.metaStatic.variantId === "string" ? request.metaStatic.variantId : null,
        projectPixelPresetId: isRecord(request.metaStatic) && typeof request.metaStatic.projectPixelPresetId === "string" ? request.metaStatic.projectPixelPresetId : profilePixelPresetId,
        platformCopy: isRecord(request.metaStatic) ? request.metaStatic.platformCopy ?? null : null,
      },
    } : {}),
  };
  let fingerprints: { pixelFingerprint: string; requestFingerprint: string } | undefined;
  try {
    fingerprints = await computeFreeformFingerprints(defaults, assetDigests, profile, requestProvenance);
  } catch {
    // If canonicalization cannot run, the plan is already invalid and remains fail-closed.
  }
  if (allIssues.some((entry) => entry.severity === "ERROR")) {
    return emptyResult(allIssues, {
      formatProfileId,
      ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
    });
  }
  const canvas = createCanvas(profile.canvas.width, profile.canvas.height);
  const context = canvas.getContext("2d");
  if (defaults.background.type === "SOLID") {
    context.fillStyle = rgbaCss(defaults.background.color);
    context.fillRect(0, 0, profile.canvas.width, profile.canvas.height);
  }
  const appliedElements: FreeformAppliedElement[] = [];
  const renderIssues: ValidationIssue[] = [];
  const ordered = stableSortCreativeElements(defaults.elements);
  for (const element of ordered) {
    const originalArrayIndex = defaults.elements.indexOf(element);
    const slot = normalizedRectToPixelRect(element.bounds, profile.canvas);
    if (element.type === "SHAPE") {
      if (profile.elementConstraints?.allowShape !== true) {
        renderIssues.push(issue(contracts, "KBR-FREEFORM-ELEMENT-TYPE-NOT-SUPPORTED", `/elements/${originalArrayIndex}/type`, { elementId: element.id, actual: "SHAPE" }));
        continue;
      }
      const rendered = renderShapeElement(context, element, slot, contracts, originalArrayIndex);
      renderIssues.push(...rendered.errors);
      if (rendered.applied) appliedElements.push(rendered.applied);
      continue;
    }
    if (element.type === "IMAGE" || element.type === "LOGO") {
      const asset = resolvedAssetsResult.assets.get(element.assetId);
      if (!asset) {
        renderIssues.push(issue(contracts, "KBR-FREEFORM-IMAGE-ASSET-NOT-FOUND", `/elements/${originalArrayIndex}/assetId`, { elementId: element.id, assetId: element.assetId }));
        continue;
      }
      const rendered = await renderImageElement(context, asset, element, slot, contracts, originalArrayIndex);
      renderIssues.push(...rendered.errors);
      if (rendered.applied) {
        rendered.applied.assetDigest = asset.digest;
        if (element.safeZoneImportance) rendered.applied.safeZoneImportance = element.safeZoneImportance;
        appliedElements.push(rendered.applied);
        assetDigests[asset.assetId] = asset.digest;
      }
      continue;
    }
    if (element.type === "TEXT") {
      const registryEntry = runtimeAssets.fontRegistry.entries.find((entry) => entry.fontId === element.fontId);
      if (!registryEntry) {
        renderIssues.push(issue(contracts, "KBR-FONT-NOT-REGISTERED", `/elements/${originalArrayIndex}/fontId`, { elementId: element.id, actual: element.fontId }));
        continue;
      }
      const fontAlias = `${FREEFORM_FONT_ALIAS_PREFIX}${element.fontId}`;
      const rendered = renderTextElement(context, element, slot, profile.canvas, fontAlias, contracts, originalArrayIndex);
      renderIssues.push(...rendered.errors);
      if (rendered.applied) {
        const fontDigest = runtimeAssets.fontDigests[element.fontId];
        const applied = fontDigest ? { ...rendered.applied, fontAssetDigest: fontDigest } : rendered.applied;
        if (element.safeZoneImportance) applied.safeZoneImportance = element.safeZoneImportance;
        appliedElements.push(applied);
      }
    }
  }
  const sortedRenderIssues = sortAndDedupeIssues([...allIssues, ...renderIssues]);
  if (sortedRenderIssues.some((entry) => entry.severity === "ERROR")) {
    return emptyResult(sortedRenderIssues, {
      formatProfileId,
      ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
    });
  }
  const rgbaPng = canvas.toBuffer("image/png");
  const outputQuality = request.output?.quality ?? (requestedFormat === "JPEG" ? "AUTO_FIT" : undefined);
  const encoded = await encodeFreeformArtifact(rgbaPng, requestedFormat, {
    ...(outputQuality !== undefined ? { quality: outputQuality } : {}),
    ...(profile.outputConstraints?.maximumBytes !== undefined ? { maximumBytes: profile.outputConstraints.maximumBytes } : {}),
    ...(profile.outputConstraints?.maximumBytesComparator ? { maximumBytesComparator: profile.outputConstraints.maximumBytesComparator } : {}),
  });
  const encoding = encoded?.jpeg ?? { format: "PNG" as const };
  const artifact = encoded?.bytes ?? null;
  const outputIssues: ValidationIssue[] = encoded === null
    ? [issue(contracts, requestedFormat === "JPEG" ? "KBR-FREEFORM-JPEG-TARGET-SIZE-NOT-ACHIEVABLE" : "KBR-FREEFORM-FILE-SIZE-EXCEEDED", requestedFormat === "JPEG" ? "/output.jpg" : "/output.png", {
      expected: profile.outputConstraints?.maximumBytes,
      actual: { format: requestedFormat },
      formatProfileId: profile.formatProfileId,
      stage: "POST_RENDER",
    })]
    : profile.outputConstraints
      ? await validateFreeformArtifact(encoded.bytes, requestedFormat, profile, contracts)
      : await validateRenderedPng(encoded.bytes, contracts, profile.canvas, "POST_RENDER");
  if (artifact && encoded?.jpeg) {
    try {
      fingerprints = await computeFreeformFingerprints(defaults, assetDigests, profile, {
        ...requestProvenance,
        outputEncoding: encoded.jpeg,
      });
    } catch {
      // Keep the deterministic pre-encode fingerprints if the optional encoding material cannot serialize.
    }
  }
  const postRenderIssues = await validateFreeformPostRender({
    contracts,
    profile,
    plan: defaults,
    appliedElements,
    resolvedAssets: assetValidationMetadata,
    fontDigests: runtimeAssets.fontDigests,
    png: artifact,
    artifact,
    artifactFormat: requestedFormat,
    ...(artifact ? { expectedArtifactChecksumSha256: sha256Bytes(artifact) } : {}),
  });
  const finalIssues = sortAndDedupeIssues([...sortedRenderIssues, ...outputIssues, ...postRenderIssues]);
  if (finalIssues.some((entry) => entry.severity === "ERROR")) {
    if (artifact && options.publish === false && options.retainArtifactOnPostRenderError === true) {
      const artifactDigest = sha256Bytes(artifact);
      const split = splitIssues(finalIssues);
      return {
        status: "BLOCKED",
        png: artifact,
        pngDigest: artifactDigest,
        manifestDigest: null,
        manifestPath: null,
        pngPath: null,
        downloadAllowed: false,
        formatProfileId: formatProfileId ?? null,
        artifactChecksumSha256: artifactDigest,
        artifactFormat: requestedFormat,
        artifactDigest,
        artifactPath: null,
        outputEncoding: encoding,
        pixelFingerprint: fingerprints?.pixelFingerprint ?? null,
        requestFingerprint: fingerprints?.requestFingerprint ?? null,
        renderFingerprint: fingerprints?.pixelFingerprint ?? null,
        appliedElements,
        errors: split.errors,
        warnings: split.warnings,
        manifest: null,
      };
    }
    return emptyResult(finalIssues, {
      formatProfileId,
      ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
    });
  }
  if (!artifact) {
    return emptyResult(finalIssues, {
      formatProfileId,
      ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
    });
  }
  const pngDigest = sha256Bytes(artifact);
  const imageAssetDigests = [...resolvedAssetsResult.assets.values()]
    .sort((left, right) => left.assetId.localeCompare(right.assetId, "en"))
    .map((asset) => ({ id: asset.assetId, sha256: asset.digest }));
  const metaStaticReport: RenderManifest["metaStaticReport"] = profile.channelNamespace === "META"
    ? {
      channel: "META",
      profileId: profile.formatProfileId,
      projectPixelPresetId: profilePixelPresetId,
      canvas: profile.canvas,
      officialRatio: profile.officialRatio ?? null,
      placementContext: metaStaticContext ?? null,
      placementContextResolution: {
        requested: metaPlacementContext.requested,
        resolved: metaPlacementContext.resolved,
        source: metaPlacementContext.source,
        path: metaPlacementContext.path,
      },
      safeZonePolicy: profile.safeZonePolicy ?? null,
      platformCopy: isRecord(request.metaStatic) ? request.metaStatic.platformCopy ?? null : null,
      reelsGeometryStatus: isReelsPlacementContext(metaStaticContext) ? "SOURCE_REQUIRED" : "NOT_APPLICABLE",
      manualAcceptanceStatus: "NOT_REVIEWED",
    }
    : undefined;
  const manifest: RenderManifest = {
    schemaVersion: "1.0.0",
    canonicalInputDigest: fingerprints?.requestFingerprint ?? sha256Bytes(Buffer.from(canonicalJson(defaults), "utf8")),
    normalizedInputDigest: fingerprints?.pixelFingerprint ?? sha256Bytes(Buffer.from(canonicalJson(defaults), "utf8")),
    outputPngDigest: pngDigest,
    outputArtifactDigest: pngDigest,
    outputFileName: freeformArtifactFileName(requestedFormat),
    outputEncoding: encoding,
    templateContractVersion: "1.9.0",
    inputSchemaVersion: "1.2.0",
    outputSchemaVersion: "2.0.0",
    validatorResult: {
      errorCount: 0,
      warningCount: finalIssues.filter((entry) => entry.severity === "WARNING").length,
      infoCount: finalIssues.filter((entry) => entry.severity === "INFO").length,
      issues: finalIssues,
    },
    assetDigests: {
      product: imageAssetDigests[0] ?? { id: "FREEFORM_NONE", sha256: sha256Bytes(Buffer.alloc(0)) },
      fonts: Object.entries(runtimeAssets.fontDigests).map(([id, sha256]) => ({ id, sha256 })).sort((left, right) => left.id.localeCompare(right.id, "en")),
      approvedIcons: [],
      referenceFixture: runtimeAssets.referenceDigest,
      images: imageAssetDigests,
    },
    ...(formatProfileId ? { formatProfileId } : {}),
    appliedElements,
    ...(fingerprints?.pixelFingerprint ? { pixelFingerprint: fingerprints.pixelFingerprint } : {}),
    ...(fingerprints?.requestFingerprint ? { requestFingerprint: fingerprints.requestFingerprint } : {}),
    ...(metaStaticReport ? { metaStaticReport } : {}),
    manualAcceptanceStatus: manifestAcceptanceStatus(),
  };
  const schemaValidators: SchemaValidators = new SchemaValidators(contracts);
  schemaValidators.assertManifest(manifest);
  const manifestText = canonicalJson(manifest);
  const manifestDigest = sha256Bytes(Buffer.from(manifestText, "utf8"));
  const finalOutput = defaultOutput(request);
  let jobDirectory: string | undefined;
  if (options.publish !== false) {
    try {
      jobDirectory = await resolveTrustedJobDirectory(options.outputRoot, finalOutput.directory, finalOutput.baseName);
    } catch (error) {
      return emptyResult([issue(contracts, "KBR-INPUT-009", "/output", { actual: publicOutputFailure(error) })], {
        formatProfileId: formatProfileId ?? null,
        ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
      });
    }
    try {
      const published = await publishArtifacts({
        outputRoot: options.outputRoot,
        jobDirectory,
        artifact,
        artifactFileName: freeformArtifactFileName(requestedFormat),
        manifest: manifestText,
        overwrite: finalOutput.overwrite,
      });
      return {
        status: "PASS",
        png: artifact,
        pngDigest,
        manifestDigest,
        manifestPath: published.manifestPath,
        pngPath: published.pngPath,
        downloadAllowed: true,
        formatProfileId: formatProfileId ?? null,
        artifactChecksumSha256: pngDigest,
        artifactFormat: requestedFormat,
        artifactDigest: pngDigest,
        artifactPath: published.artifactPath,
        outputEncoding: encoding,
        pixelFingerprint: fingerprints?.pixelFingerprint ?? null,
        requestFingerprint: fingerprints?.requestFingerprint ?? null,
        renderFingerprint: fingerprints?.pixelFingerprint ?? null,
        appliedElements,
        errors: [],
        warnings: splitIssues(finalIssues).warnings,
        ...(metaStaticReport ? { metaStaticReport } : {}),
        manifest,
      };
    } catch (error) {
      const code = error instanceof PublishError ? error.code : "KBR-SYSTEM-004";
      return emptyResult([issue(contracts, code, "/output", { actual: publicOutputFailure(error) })], {
        formatProfileId,
        ...(fingerprints ? { pixelFingerprint: fingerprints.pixelFingerprint, requestFingerprint: fingerprints.requestFingerprint } : {}),
      });
    }
  }
  return {
    status: "PASS",
    png: artifact,
    pngDigest,
    manifestDigest,
    manifestPath: null,
    pngPath: null,
    downloadAllowed: false,
    formatProfileId: formatProfileId ?? null,
    artifactChecksumSha256: pngDigest,
    artifactFormat: requestedFormat,
    artifactDigest: pngDigest,
    artifactPath: null,
    outputEncoding: encoding,
    pixelFingerprint: fingerprints?.pixelFingerprint ?? null,
    requestFingerprint: fingerprints?.requestFingerprint ?? null,
    renderFingerprint: fingerprints?.pixelFingerprint ?? null,
    appliedElements,
    errors: [],
    warnings: splitIssues(finalIssues).warnings,
    ...(metaStaticReport ? { metaStaticReport } : {}),
    manifest,
  };
}

export async function renderFreeform(
  request: FreeformRenderRequest,
  options: FreeformRenderOptions,
): Promise<FreeformRenderResult> {
  return renderFreeformInternal(request, options);
}

export async function renderFreeformPreviewArtifact(
  request: FreeformRenderRequest,
  options: FreeformRenderOptions,
): Promise<FreeformRenderResult> {
  return renderFreeformInternal(request, {
    ...options,
    publish: false,
    retainArtifactOnPostRenderError: true,
  });
}

export { freeformResponseFromResult as toFreeformRenderResponse };
