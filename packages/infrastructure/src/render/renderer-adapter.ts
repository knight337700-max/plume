import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  parseCreativeDocument,
  type CreativeDocument,
  type CreativeElement,
} from "../../../core/src/modules/creative/creative-document.js";
import { hashCreativeDocument } from "../../../core/src/modules/creative/document-hash.js";
import { optimizeRenderOutput } from "./optimize-output.js";

export type RenderPurpose = "PREVIEW" | "VALIDATION" | "FINAL_EXPORT";
export interface RenderAssetAccess {
  readonly assetVersionId: string;
  readonly checksumSha256?: string;
  readonly color?: string;
}
export interface RenderRequest {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly purpose: RenderPurpose;
  readonly creativeDocument: CreativeDocument;
  readonly outputProfile: {
    readonly mimeType: "image/png" | "image/jpeg";
    readonly width: number;
    readonly height: number;
    readonly maxBytes?: number | null;
    readonly transparentBackground?: boolean;
  };
  readonly assetAccess?: readonly RenderAssetAccess[];
  readonly fontPackageId?: string | null;
}
export interface RenderResult {
  readonly requestId: string;
  readonly status: "COMPLETED" | "FAILED";
  readonly outputFileId: null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly checksumSha256: string | null;
  readonly outputBytes: Uint8Array | null;
  readonly renderMetadata?: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
  readonly error?: Readonly<Record<string, unknown>> | null;
}

const RENDERER_VERSION = "native-deterministic-raster-v1";
const WHITE = [255, 255, 255, 255] as const;
const TRANSPARENT = [0, 0, 0, 0] as const;
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseColor(
  value: unknown,
  fallback: readonly [number, number, number, number] = [64, 84, 110, 255],
): readonly [number, number, number, number] {
  if (typeof value !== "string") return fallback;
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex))
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      255,
    ];
  if (/^[0-9a-f]{8}$/i.test(hex))
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      parseInt(hex.slice(6, 8), 16),
    ];
  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  if (rgb)
    return [
      clamp(Number(rgb[1]), 0, 255),
      clamp(Number(rgb[2]), 0, 255),
      clamp(Number(rgb[3]), 0, 255),
      clamp(Number(rgb[4] === undefined ? 1 : Number(rgb[4]) * 255), 0, 255),
    ];
  return fallback;
}

function fillPixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
  opacity: number,
): void {
  if (x < 0 || y < 0 || x >= width) return;
  const index = (y * width + x) * 4;
  const sourceAlpha = (color[3] / 255) * Math.max(0, Math.min(1, opacity));
  const destinationAlpha = pixels[index + 3] / 255;
  const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (alpha <= 0) {
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
    pixels[index + 3] = 0;
    return;
  }
  pixels[index] = clamp(
    (color[0] * sourceAlpha + pixels[index] * destinationAlpha * (1 - sourceAlpha)) / alpha,
    0,
    255,
  );
  pixels[index + 1] = clamp(
    (color[1] * sourceAlpha + pixels[index + 1] * destinationAlpha * (1 - sourceAlpha)) / alpha,
    0,
    255,
  );
  pixels[index + 2] = clamp(
    (color[2] * sourceAlpha + pixels[index + 2] * destinationAlpha * (1 - sourceAlpha)) / alpha,
    0,
    255,
  );
  pixels[index + 3] = clamp(alpha * 255, 0, 255);
}

function drawRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  element: CreativeElement,
  color: readonly [number, number, number, number],
  scaleX: number,
  scaleY: number,
): void {
  const x0 = clamp(element.x * scaleX, 0, width);
  const y0 = clamp(element.y * scaleY, 0, height);
  const x1 = clamp((element.x + element.width) * scaleX, 0, width);
  const y1 = clamp((element.y + element.height) * scaleY, 0, height);
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) fillPixel(pixels, width, x, y, color, element.opacity ?? 1);
}

function drawText(
  pixels: Uint8Array,
  width: number,
  height: number,
  element: CreativeElement,
  text: string,
  color: readonly [number, number, number, number],
  scaleX: number,
  scaleY: number,
): void {
  const glyphScale = Math.max(
    1,
    Math.floor(Math.min((element.width * scaleX) / 6, (element.height * scaleY) / 8)),
  );
  const startX = Math.max(0, Math.floor(element.x * scaleX));
  const startY = Math.max(0, Math.floor(element.y * scaleY));
  let cursorX = startX;
  for (const character of text.toUpperCase().slice(0, 120)) {
    const glyph = GLYPHS[character] ?? GLYPHS[" "];
    for (let row = 0; row < glyph.length; row += 1)
      for (let column = 0; column < glyph[row].length; column += 1)
        if (glyph[row][column] === "1")
          for (let sy = 0; sy < glyphScale; sy += 1)
            for (let sx = 0; sx < glyphScale; sx += 1)
              fillPixel(
                pixels,
                width,
                cursorX + column * glyphScale + sx,
                startY + row * glyphScale + sy,
                color,
                element.opacity ?? 1,
              );
    cursorX += glyphScale * 6;
    if (cursorX >= Math.min(width, (element.x + element.width) * scaleX)) break;
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const content = new Uint8Array(typeBytes.length + data.length);
  content.set(typeBytes);
  content.set(data, typeBytes.length);
  const output = new Uint8Array(12 + data.length);
  new DataView(output.buffer).setUint32(0, data.length);
  output.set(content, 4);
  new DataView(output.buffer).setUint32(output.length - 4, crc32(content));
  return output;
}

function encodePng(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const idat = deflateSync(scanlines, { level: 9 });
  const chunks = [
    pngChunk("IHDR", header),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array()),
  ];
  const output = new Uint8Array(
    signature.length + chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  output.set(signature);
  let offset = signature.length;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function failed(
  request: RenderRequest,
  code: string,
  message: string,
  warnings: readonly string[] = [],
): RenderResult {
  return {
    requestId: request.requestId,
    status: "FAILED",
    outputFileId: null,
    width: null,
    height: null,
    bytes: null,
    checksumSha256: null,
    outputBytes: null,
    warnings,
    error: { code, message },
  };
}

export function renderCreativeDocument(request: RenderRequest): RenderResult {
  try {
    const document = parseCreativeDocument(request.creativeDocument);
    if (document.metadata.workspaceId !== request.workspaceId)
      return failed(
        request,
        "WORKSPACE_SCOPE_MISMATCH",
        "Creative Document workspace does not match render request",
      );
    if (request.outputProfile.mimeType !== "image/png")
      return failed(
        request,
        "UNSUPPORTED_OUTPUT_MIME",
        "The selected deterministic raster adapter currently emits PNG only",
      );
    if (
      !Number.isInteger(request.outputProfile.width) ||
      !Number.isInteger(request.outputProfile.height) ||
      request.outputProfile.width < 1 ||
      request.outputProfile.height < 1
    )
      return failed(
        request,
        "INVALID_OUTPUT_DIMENSIONS",
        "Output dimensions must be positive integers",
      );
    const accesses = new Map(
      (request.assetAccess ?? []).map((access) => [access.assetVersionId, access]),
    );
    for (const assetVersionId of document.usedAssetVersionIds)
      if (!accesses.has(assetVersionId))
        return failed(
          request,
          "ASSET_ACCESS_MISSING",
          `No asset access was provided for ${assetVersionId}`,
        );
    const width = request.outputProfile.width;
    const height = request.outputProfile.height;
    const pixels = new Uint8Array(width * height * 4);
    const transparent =
      request.outputProfile.transparentBackground ?? document.canvas.transparentBackground;
    const background = transparent ? TRANSPARENT : parseColor(document.canvas.background, WHITE);
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) fillPixel(pixels, width, x, y, background, 1);
    const warnings: string[] = [];
    const scaleX = width / document.canvas.width;
    const scaleY = height / document.canvas.height;
    const sortedElements = [...document.elements]
      .filter((element) => element.visible)
      .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
    for (const element of sortedElements) {
      const style = element.style ?? {};
      const defaultColor = element.assetVersionId
        ? accesses.get(element.assetVersionId)?.color
        : undefined;
      const color = parseColor(style.fill ?? style.color ?? defaultColor, [64, 84, 110, 255]);
      if (element.rotation) warnings.push(`ROTATION_APPROXIMATED:${element.id}`);
      if (element.type === "TEXT" || element.type === "CTA") {
        warnings.push(`FONT_FALLBACK_USED:${element.id}`);
        drawText(pixels, width, height, element, element.text ?? "", color, scaleX, scaleY);
      } else drawRect(pixels, width, height, element, color, scaleX, scaleY);
    }
    const optimized = optimizeRenderOutput({
      bytes: encodePng(pixels, width, height),
      mimeType: "image/png",
      maxBytes: request.outputProfile.maxBytes,
    });
    if (!optimized.withinMaxBytes)
      return failed(
        request,
        "OUTPUT_SIZE_LIMIT_EXCEEDED",
        `PNG output is ${optimized.optimizedBytes} bytes`,
        warnings,
      );
    const outputBytes = optimized.bytes;
    const checksumSha256 = createHash("sha256").update(outputBytes).digest("hex");
    const renderConfig = {
      purpose: request.purpose,
      outputProfile: request.outputProfile,
      fontPackageId: request.fontPackageId ?? null,
    };
    return {
      requestId: request.requestId,
      status: "COMPLETED",
      outputFileId: null,
      width,
      height,
      bytes: outputBytes.byteLength,
      checksumSha256,
      outputBytes,
      warnings: [...new Set(warnings)].sort(),
      renderMetadata: {
        rendererVersion: RENDERER_VERSION,
        documentHash: hashCreativeDocument(document),
        assetHashes: [...accesses.entries()]
          .filter(([id]) => document.usedAssetVersionIds.includes(id))
          .map(([id, access]) => ({
            assetVersionId: id,
            checksumSha256: access.checksumSha256 ?? null,
          }))
          .sort((a, b) => a.assetVersionId.localeCompare(b.assetVersionId)),
        fontPackageHash: request.fontPackageId
          ? createHash("sha256").update(request.fontPackageId).digest("hex")
          : null,
        renderConfigHash: createHash("sha256").update(JSON.stringify(renderConfig)).digest("hex"),
        outputChecksum: checksumSha256,
      },
    };
  } catch (error) {
    return failed(
      request,
      "RENDER_FAILED",
      error instanceof Error ? error.message : "Unknown render error",
    );
  }
}
