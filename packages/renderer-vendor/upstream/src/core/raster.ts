import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

import type { ContractBundle } from "./contracts.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HARD_LIMIT_BYTES,
  HEADLINE_BASELINE_Y,
  SUBCOPY_BASELINE_Y,
  TEXT_DRAW_X,
  WARNING_THRESHOLD_BYTES,
} from "./constants.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import type { CanonicalInput, ProductAnalysis, ValidationIssue, ValidationStage } from "./types.js";

export type PngIhdr = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
};

export type JpegEncoding = Readonly<{
  format: "JPEG";
  qualityRequested: number | "AUTO_FIT";
  qualityResolved: number;
  chromaSubsampling: "4:2:0";
  progressive: false;
  metadataStripped: true;
}>;

export type FreeformArtifactEncoding = Readonly<{
  format: "PNG" | "JPEG";
  bytes: Buffer;
  jpeg?: JpegEncoding;
}>;

/** Encode the already-rasterized RGBA canvas without introducing a format switch. */
export async function encodeFreeformArtifact(
  rgbaPng: Buffer,
  format: "PNG" | "JPEG",
  options: Readonly<{ quality?: number | "AUTO_FIT"; maximumBytes?: number; maximumBytesComparator?: "LTE" | "LT" }> = {},
): Promise<FreeformArtifactEncoding | null> {
  if (format === "PNG") return { format, bytes: rgbaPng };
  const requested = options.quality ?? "AUTO_FIT";
  const qualities = typeof requested === "number" ? [Math.round(requested)] : [92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48];
  for (const quality of qualities) {
    const bytes = await sharp(rgbaPng, { failOn: "error" })
      .jpeg({ quality, chromaSubsampling: "4:2:0", progressive: false, mozjpeg: false })
      .toBuffer();
    const maximumBytes = options.maximumBytes;
    const withinLimit = maximumBytes === undefined
      ? true
      : options.maximumBytesComparator === "LT" ? bytes.byteLength < maximumBytes : bytes.byteLength <= maximumBytes;
    if (withinLimit) {
      return {
        format,
        bytes,
        jpeg: {
          format: "JPEG",
          qualityRequested: requested,
          qualityResolved: quality,
          chromaSubsampling: "4:2:0",
          progressive: false,
          metadataStripped: true,
        },
      };
    }
    if (typeof requested === "number") break;
  }
  return null;
}

export async function hasOpaquePixels(bytes: Buffer): Promise<boolean> {
  const raw = await sharp(bytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 3; index < raw.data.length; index += 4) if ((raw.data[index] ?? 0) !== 255) return false;
  return true;
}

export async function inspectRenderedArtifact(
  bytes: Buffer,
  format: "PNG" | "JPEG",
  expectedCanvas: Readonly<{ width: number; height: number }>,
): Promise<{ width: number; height: number; hasAlpha: boolean; opaque: boolean; metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>> | null }> {
  try {
    const image = sharp(bytes, { failOn: "error" });
    const metadata = await image.metadata();
    const formatMatches = format === "PNG" ? metadata.format === "png" : metadata.format === "jpeg";
    if (!formatMatches || metadata.width !== expectedCanvas.width || metadata.height !== expectedCanvas.height) {
      return { width: metadata.width ?? 0, height: metadata.height ?? 0, hasAlpha: Boolean(metadata.hasAlpha), opaque: false, metadata };
    }
    return { width: metadata.width ?? 0, height: metadata.height ?? 0, hasAlpha: Boolean(metadata.hasAlpha), opaque: await hasOpaquePixels(bytes), metadata };
  } catch {
    return { width: 0, height: 0, hasAlpha: false, opaque: false, metadata: null };
  }
}

export function inspectPngIhdr(png: Uint8Array): PngIhdr | null {
  const buffer = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  if (buffer.length < 29 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
  };
}

export function renderRgbaPng(input: CanonicalInput, product: ProductAnalysis): Buffer {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const productPixels = new Uint8ClampedArray(
    product.resizedRgba.buffer,
    product.resizedRgba.byteOffset,
    product.resizedRgba.byteLength,
  );
  context.putImageData(
    new ImageData(productPixels, product.resizedWidth, product.resizedHeight),
    product.destinationX,
    product.destinationY,
  );
  context.textBaseline = "alphabetic";
  context.font = `48px "${FONT_ALIAS_BOLD}"`;
  context.fillStyle = "#4C4C4C";
  context.fillText(input.copy.headline, TEXT_DRAW_X, HEADLINE_BASELINE_Y);
  context.font = `39px "${FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#777777";
  context.fillText(input.copy.subcopy, TEXT_DRAW_X, SUBCOPY_BASELINE_Y);
  return canvas.toBuffer("image/png");
}

export async function validateRenderedPng(
  png: Buffer,
  contracts: ContractBundle,
  expectedCanvas: Readonly<{ width: number; height: number }> = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  stage?: ValidationStage,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const ihdr = inspectPngIhdr(png);
  if (!ihdr) {
    return [createIssue(contracts.errorRegistry, "KBR-OUTPUT-003", "/output.png", stage ? { stage } : {})];
  }
  if (ihdr.width !== expectedCanvas.width || ihdr.height !== expectedCanvas.height) {
      issues.push(
      createIssue(contracts.errorRegistry, "KBR-OUTPUT-002", "/output.png", {
        expected: expectedCanvas,
        actual: { width: ihdr.width, height: ihdr.height },
        ...(stage ? { stage } : {}),
      }),
    );
  }
  if (ihdr.colorType !== 6 || ihdr.bitDepth !== 8) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-OUTPUT-003", "/output.png", {
        expected: { colorType: 6, bitDepth: 8 },
        actual: { colorType: ihdr.colorType, bitDepth: ihdr.bitDepth },
        ...(stage ? { stage } : {}),
      }),
    );
  }
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(png).metadata();
  } catch {
    issues.push(createIssue(contracts.errorRegistry, "KBR-OUTPUT-003", "/output.png", stage ? { stage } : {}));
    return sortAndDedupeIssues(issues);
  }
  if (!metadata.hasAlpha) issues.push(createIssue(contracts.errorRegistry, "KBR-OUTPUT-004", "/output.png", stage ? { stage } : {}));
  if (png.byteLength >= HARD_LIMIT_BYTES + 1) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-OUTPUT-005", "/output.png", {
        expected: { maximumBytes: HARD_LIMIT_BYTES },
        actual: { bytes: png.byteLength },
        ...(stage ? { stage } : {}),
      }),
    );
  } else if (png.byteLength >= WARNING_THRESHOLD_BYTES + 1) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-OUTPUT-009", "/output.png", {
        expected: { warningThresholdBytes: WARNING_THRESHOLD_BYTES, hardLimitBytes: HARD_LIMIT_BYTES },
        actual: { bytes: png.byteLength },
        ...(stage ? { stage } : {}),
      }),
    );
  }
  return sortAndDedupeIssues(issues);
}
