import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import sharp from "sharp";

// eslint-disable-next-line no-restricted-imports -- This boundary reuses the pinned renderer font cmap preflight.
import { inspectFontGlyphCoverage } from "../upstream/src/core/naver-smartchannel-font-preflight.js";
// eslint-disable-next-line no-restricted-imports -- Text metrics must remain identical to the pinned renderer contract.
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HEADLINE_BASELINE_Y,
  HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS,
  MAXIMUM_OCCUPIED_WIDTH_PX,
  SUBCOPY_BASELINE_Y,
  SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS,
  TEXT_DRAW_X,
  TEXT_HARD_RIGHT_EDGE,
} from "../upstream/src/core/constants.js";
// eslint-disable-next-line no-restricted-imports -- Text units are defined by the pinned renderer contract.
import { koreanEquivalentUnits } from "../upstream/src/core/text-contract.js";
// eslint-disable-next-line no-restricted-imports -- Slot geometry is read from the pinned renderer, never reimplemented.
import { THUMBNAIL_BOX_RIGHT_SLOT } from "../upstream/src/core/thumbnail-box-right.js";

export type ThumbnailBoxRightCopy = Readonly<{
  readonly headline?: string;
  readonly subcopy?: string;
}>;

export type ThumbnailBoxRightTextField = "headline" | "subcopy";

export type ThumbnailBoxRightTextMetrics = Readonly<{
  field: ThumbnailBoxRightTextField;
  text: string;
  fontAlias: string;
  fontSizePx: number;
  inkBounds: { x: number; y: number; width: number; height: number };
  rightExclusive: number;
  occupiedWidthPx: number;
  koreanEquivalentUnits: number;
  maxKoreanEquivalentUnits: number;
}>;

export type ThumbnailBoxRightTextValidation = Readonly<{
  status: "PASS";
  headline: ThumbnailBoxRightTextMetrics;
  subcopy: ThumbnailBoxRightTextMetrics;
  fontDigests: Readonly<{ bold: string; regular: string }>;
}>;

export type ThumbnailBoxRightTextRasterInspection = Readonly<{
  status: "PASS" | "FAIL";
  width: number;
  height: number;
  textRegionExpectedPixels: number;
  textRegionActualPixels: number;
  textRegionMismatchPixels: number;
  expectedTextPixelsInImageSlot: number;
  hangulGlyphsRendered: boolean;
}>;

export type ThumbnailBoxRightTextValidationErrorCode =
  | "CANONICAL_THUMBNAIL_FONT_ASSET_MISSING"
  | "CANONICAL_THUMBNAIL_FONT_REGISTRATION_FAILED"
  | "CANONICAL_THUMBNAIL_FONT_GLYPH_UNSUPPORTED"
  | "CANONICAL_THUMBNAIL_TEXT_EMPTY"
  | "CANONICAL_THUMBNAIL_TEXT_OVERFLOW"
  | "CANONICAL_THUMBNAIL_TEXT_IMAGE_SLOT_OVERLAP";

export class ThumbnailBoxRightTextValidationError extends Error {
  public readonly code: ThumbnailBoxRightTextValidationErrorCode;
  public readonly details: Readonly<Record<string, unknown>>;

  public constructor(
    code: ThumbnailBoxRightTextValidationErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "ThumbnailBoxRightTextValidationError";
    this.code = code;
    this.details = details;
  }
}

type RequiredFontAsset = Readonly<{
  id: "SPOQA_HAN_SANS_BOLD" | "SPOQA_HAN_SANS_REGULAR";
  alias: string;
  relativePath: string;
  sha256: string;
}>;

type LoadedFontAsset = RequiredFontAsset & Readonly<{ path: string; bytes: Uint8Array }>;

const REQUIRED_FONTS: Readonly<{
  bold: RequiredFontAsset;
  regular: RequiredFontAsset;
}> = Object.freeze({
  bold: {
    id: "SPOQA_HAN_SANS_BOLD",
    alias: FONT_ALIAS_BOLD,
    relativePath: "assets/fonts/SpoqaHanSansBold.ttf",
    sha256: "5a6b9b258145e243dfd5f70cc869119c6af708843658e380304bdfe3d4f4eaef",
  },
  regular: {
    id: "SPOQA_HAN_SANS_REGULAR",
    alias: FONT_ALIAS_REGULAR,
    relativePath: "assets/fonts/SpoqaHanSansRegular.ttf",
    sha256: "1f56c8535b6592672ea7f540a67bb5792c34558d72875fc504166a3e2b28b4b1",
  },
});

let loadedFontsPromise:
  | Promise<Readonly<{ bold: LoadedFontAsset; regular: LoadedFontAsset }>>
  | undefined;

function rendererRuntimeRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../upstream/", import.meta.url)),
    fileURLToPath(new URL("../../upstream/", import.meta.url)),
  ];
  const root = candidates.find((candidate) =>
    existsSync(path.join(candidate, "contracts", "font-asset-registry.json")),
  );
  if (!root)
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_ASSET_MISSING",
      "Pinned thumbnail font registry is unavailable",
    );
  return root;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function loadFont(asset: RequiredFontAsset, root: string): Promise<LoadedFontAsset> {
  const fontPath = path.join(root, ...asset.relativePath.split("/"));
  let bytes: Uint8Array;
  try {
    bytes = await readFile(fontPath);
  } catch {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_ASSET_MISSING",
      `Pinned thumbnail font asset is unavailable: ${asset.id}`,
      { assetId: asset.id, path: fontPath },
    );
  }
  const digest = sha256(bytes);
  if (digest !== asset.sha256) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_ASSET_MISSING",
      `Pinned thumbnail font asset digest mismatch: ${asset.id}`,
      { assetId: asset.id, expected: asset.sha256, actual: digest },
    );
  }
  const registrationResult = GlobalFonts.registerFromPath(fontPath, asset.alias);
  const registration =
    typeof registrationResult === "boolean" ? registrationResult : registrationResult !== null;
  if (registration !== true) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_REGISTRATION_FAILED",
      `Pinned thumbnail font registration failed: ${asset.alias}`,
      { assetId: asset.id, alias: asset.alias },
    );
  }
  return { ...asset, path: fontPath, bytes };
}

async function loadFonts(): Promise<Readonly<{ bold: LoadedFontAsset; regular: LoadedFontAsset }>> {
  const root = rendererRuntimeRoot();
  const registryPath = path.join(root, "contracts", "font-asset-registry.json");
  try {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as unknown;
    if (!isRecord(registry) || registry.status !== "RESOLVED_ASSET")
      throw new Error("FONT_REGISTRY_UNRESOLVED");
    const requiredAssets = Array.isArray(registry.requiredAssets) ? registry.requiredAssets : [];
    for (const required of [REQUIRED_FONTS.bold, REQUIRED_FONTS.regular]) {
      const entry = requiredAssets.find(
        (candidate) => isRecord(candidate) && candidate.id === required.id,
      );
      if (
        !isRecord(entry) ||
        entry.status !== "RESOLVED_ASSET" ||
        entry.relativePath !== required.relativePath ||
        entry.sha256 !== required.sha256
      )
        throw new Error(`FONT_REGISTRY_ENTRY_INVALID:${required.id}`);
    }
  } catch (error) {
    if (error instanceof ThumbnailBoxRightTextValidationError) throw error;
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_ASSET_MISSING",
      "Pinned thumbnail font registry cannot be verified",
      { path: registryPath },
    );
  }
  const [bold, regular] = await Promise.all([
    loadFont(REQUIRED_FONTS.bold, root),
    loadFont(REQUIRED_FONTS.regular, root),
  ]);
  return { bold, regular };
}

async function loadedFonts(): Promise<
  Readonly<{ bold: LoadedFontAsset; regular: LoadedFontAsset }>
> {
  loadedFontsPromise ??= loadFonts();
  try {
    return await loadedFontsPromise;
  } catch (error) {
    loadedFontsPromise = undefined;
    throw error;
  }
}

function scanCanvasAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function intersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function measureField(
  field: ThumbnailBoxRightTextField,
  text: string,
  fontAlias: string,
  fontSizePx: number,
  baselineY: number,
  maxKoreanEquivalentUnits: number,
): ThumbnailBoxRightTextMetrics {
  if (!text.trim()) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_TEXT_EMPTY",
      `${field} must contain visible text`,
      { field },
    );
  }
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  context.textBaseline = "alphabetic";
  context.font = `${fontSizePx}px "${fontAlias}"`;
  context.fillStyle = field === "headline" ? "#4C4C4C" : "#777777";
  context.fillText(text, TEXT_DRAW_X, baselineY);
  const inkBounds = scanCanvasAlpha(
    context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
  );
  if (!inkBounds) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_GLYPH_UNSUPPORTED",
      `${field} produced no visible glyphs`,
      { field, text },
    );
  }
  const rightExclusive = inkBounds.x + inkBounds.width;
  const occupiedWidthPx = Math.max(0, rightExclusive - TEXT_DRAW_X);
  const units = koreanEquivalentUnits(text);
  if (
    rightExclusive > TEXT_HARD_RIGHT_EDGE ||
    occupiedWidthPx > MAXIMUM_OCCUPIED_WIDTH_PX ||
    units > maxKoreanEquivalentUnits
  ) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_TEXT_OVERFLOW",
      `${field} exceeds the canonical text contract`,
      {
        field,
        text,
        inkBounds,
        rightExclusive,
        hardRightEdgeExclusive: TEXT_HARD_RIGHT_EDGE,
        occupiedWidthPx,
        maxOccupiedWidthPx: MAXIMUM_OCCUPIED_WIDTH_PX,
        koreanEquivalentUnits: units,
        maxKoreanEquivalentUnits,
      },
    );
  }
  if (intersects(inkBounds, THUMBNAIL_BOX_RIGHT_SLOT)) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_TEXT_IMAGE_SLOT_OVERLAP",
      `${field} intersects IMAGE_PRIMARY`,
      { field, inkBounds, imageSlot: THUMBNAIL_BOX_RIGHT_SLOT },
    );
  }
  return {
    field,
    text,
    fontAlias,
    fontSizePx,
    inkBounds,
    rightExclusive,
    occupiedWidthPx,
    koreanEquivalentUnits: units,
    maxKoreanEquivalentUnits,
  };
}

async function expectedTextRaster(copy: ThumbnailBoxRightCopy): Promise<Uint8ClampedArray> {
  await validateThumbnailBoxRightText(copy);
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  context.textBaseline = "alphabetic";
  context.font = `48px "${FONT_ALIAS_BOLD}"`;
  context.fillStyle = "#4C4C4C";
  context.fillText(
    typeof copy.headline === "string" ? copy.headline : "",
    TEXT_DRAW_X,
    HEADLINE_BASELINE_Y,
  );
  context.font = `39px "${FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#777777";
  context.fillText(
    typeof copy.subcopy === "string" ? copy.subcopy : "",
    TEXT_DRAW_X,
    SUBCOPY_BASELINE_Y,
  );
  return context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
}

/**
 * Independently compares the output's text-only region with the same pinned
 * font raster used by the public renderer boundary. This catches a renderer
 * call that silently falls back to tofu even when metadata reports PASS.
 */
export async function inspectThumbnailBoxRightTextRaster(
  bytes: Uint8Array,
  copy: ThumbnailBoxRightCopy,
): Promise<ThumbnailBoxRightTextRasterInspection> {
  const expected = await expectedTextRaster(copy);
  const actual = await sharp(Buffer.from(bytes), { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    actual.info.width !== CANVAS_WIDTH ||
    actual.info.height !== CANVAS_HEIGHT ||
    actual.info.channels !== 4
  ) {
    return {
      status: "FAIL",
      width: actual.info.width,
      height: actual.info.height,
      textRegionExpectedPixels: 0,
      textRegionActualPixels: 0,
      textRegionMismatchPixels: CANVAS_WIDTH * CANVAS_HEIGHT,
      expectedTextPixelsInImageSlot: 0,
      hangulGlyphsRendered: false,
    };
  }
  let expectedPixels = 0;
  let actualPixels = 0;
  let mismatchPixels = 0;
  let expectedTextPixelsInImageSlot = 0;
  const slotX = THUMBNAIL_BOX_RIGHT_SLOT.x;
  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      const offset = (y * CANVAS_WIDTH + x) * 4;
      const expectedAlpha = expected[offset + 3] ?? 0;
      if (expectedAlpha > 0 && x >= slotX) expectedTextPixelsInImageSlot += 1;
      if (x >= slotX) continue;
      const actualAlpha = actual.data[offset + 3] ?? 0;
      if (expectedAlpha > 0) expectedPixels += 1;
      if (actualAlpha > 0) actualPixels += 1;
      if (
        expected[offset] !== actual.data[offset] ||
        expected[offset + 1] !== actual.data[offset + 1] ||
        expected[offset + 2] !== actual.data[offset + 2] ||
        expectedAlpha !== actualAlpha
      )
        mismatchPixels += 1;
    }
  }
  return {
    status:
      mismatchPixels === 0 && expectedPixels > 0 && expectedTextPixelsInImageSlot === 0
        ? "PASS"
        : "FAIL",
    width: actual.info.width,
    height: actual.info.height,
    textRegionExpectedPixels: expectedPixels,
    textRegionActualPixels: actualPixels,
    textRegionMismatchPixels: mismatchPixels,
    expectedTextPixelsInImageSlot,
    hangulGlyphsRendered: mismatchPixels === 0 && expectedPixels > 0,
  };
}

export async function validateThumbnailBoxRightText(
  copy: ThumbnailBoxRightCopy,
): Promise<ThumbnailBoxRightTextValidation> {
  const fonts = await loadedFonts();
  const headlineText = typeof copy.headline === "string" ? copy.headline : "";
  const subcopyText = typeof copy.subcopy === "string" ? copy.subcopy : "";
  const headlineCoverage = inspectFontGlyphCoverage(fonts.bold.bytes, headlineText);
  if (!headlineCoverage.covered) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_GLYPH_UNSUPPORTED",
      "Headline contains glyphs absent from the pinned Korean font",
      { field: "headline", missingCodePoints: headlineCoverage.missingCodePoints },
    );
  }
  const subcopyCoverage = inspectFontGlyphCoverage(fonts.regular.bytes, subcopyText);
  if (!subcopyCoverage.covered) {
    throw new ThumbnailBoxRightTextValidationError(
      "CANONICAL_THUMBNAIL_FONT_GLYPH_UNSUPPORTED",
      "Subcopy contains glyphs absent from the pinned Korean font",
      { field: "subcopy", missingCodePoints: subcopyCoverage.missingCodePoints },
    );
  }
  const headline = measureField(
    "headline",
    headlineText,
    FONT_ALIAS_BOLD,
    48,
    HEADLINE_BASELINE_Y,
    HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS,
  );
  const subcopy = measureField(
    "subcopy",
    subcopyText,
    FONT_ALIAS_REGULAR,
    39,
    SUBCOPY_BASELINE_Y,
    SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS,
  );
  return {
    status: "PASS",
    headline,
    subcopy,
    fontDigests: { bold: sha256(fonts.bold.bytes), regular: sha256(fonts.regular.bytes) },
  };
}

export function resetThumbnailBoxRightFontCacheForTests(): void {
  loadedFontsPromise = undefined;
}
