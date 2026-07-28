import { detectMimeType, imageDimensions } from "../files/magic-byte.js";

export interface ImageAnalysis {
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly alpha: boolean;
  readonly background: "OPAQUE" | "TRANSPARENT_POSSIBLE" | "UNKNOWN";
  readonly quality: { readonly score: number; readonly warnings: readonly string[] };
}

export function analyzeImage(bytes: Uint8Array, declaredMimeType: string): ImageAnalysis {
  const detectedMimeType = detectMimeType(bytes);
  if (detectedMimeType !== declaredMimeType || !["image/png", "image/jpeg"].includes(declaredMimeType)) {
    const error = new Error(`Unsupported image type: ${declaredMimeType}`);
    Object.assign(error, { code: "UNSUPPORTED_IMAGE", statusCode: 422, detectedMimeType });
    throw error;
  }
  const dimensions = imageDimensions(bytes, declaredMimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    const error = new Error("Image dimensions could not be read");
    Object.assign(error, { code: "IMAGE_METADATA_UNREADABLE", statusCode: 422 });
    throw error;
  }
  const warnings: string[] = [];
  const pixels = dimensions.width * dimensions.height;
  if (pixels < 160_000) warnings.push("LOW_RESOLUTION");
  if (bytes.byteLength > pixels * 8) warnings.push("HIGH_COMPRESSION_RATIO");
  const score = Math.max(0, Math.min(1, Math.log10(Math.max(pixels, 1)) / 8 - warnings.length * 0.1));
  return {
    mimeType: declaredMimeType,
    width: dimensions.width,
    height: dimensions.height,
    alpha: dimensions.alpha,
    background: dimensions.alpha ? "TRANSPARENT_POSSIBLE" : "OPAQUE",
    quality: { score, warnings },
  };
}
