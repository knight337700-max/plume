import { readFile } from "node:fs/promises";

import sharp from "sharp";

export const SUPPORTED_INPUT_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export type SupportedInputMimeType = (typeof SUPPORTED_INPUT_MIME_TYPES)[number];

export type ImageInputMetadata = Readonly<{
  detectedMimeType: SupportedInputMimeType;
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
  exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}>;

export type InspectedImage = Readonly<{
  bytes: Buffer;
  metadata: ImageInputMetadata;
}>;

export type ImageInputErrorCode =
  | "KBR-ASSET-MIME-NOT-ALLOWED"
  | "KBR-ASSET-MIME-EXTENSION-MISMATCH"
  | "KBR-IMAGE-DECODE-FAILED"
  | "KBR-IMAGE-DIMENSION-INVALID"
  | "KBR-EXIF-ORIENTATION-INVALID";

export class ImageInputError extends Error {
  readonly code: ImageInputErrorCode;

  constructor(code: ImageInputErrorCode, message: string) {
    super(message);
    this.name = "ImageInputError";
    this.code = code;
  }
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectImageMimeFromBytes(bytes: Uint8Array): SupportedInputMimeType | null {
  if (bytes.byteLength >= PNG_SIGNATURE.byteLength && startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return null;
}

export function mimeForImageExtension(extension: string): SupportedInputMimeType | null {
  const normalized = extension.toLowerCase();
  if (normalized === ".png") return "image/png";
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  return null;
}

function readUInt16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "EXIF Orientation field is truncated");
  const first = bytes[offset] ?? 0;
  const second = bytes[offset + 1] ?? 0;
  return littleEndian ? first | (second << 8) : (first << 8) | second;
}

function readUInt32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "EXIF Orientation field is truncated");
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return littleEndian
    ? (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
    : ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function parseExifOrientation(bytes: Uint8Array): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  if (bytes.byteLength < 4) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = readUInt16(bytes, offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "JPEG segment is truncated");
    }
    if (marker === 0xe1 && segmentLength >= 8) {
      const exif = offset + 2;
      const isExif = bytes[exif] === 0x45 && bytes[exif + 1] === 0x78 && bytes[exif + 2] === 0x69 && bytes[exif + 3] === 0x66 && bytes[exif + 4] === 0x00 && bytes[exif + 5] === 0x00;
      if (isExif) {
        const tiff = exif + 6;
        const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
        const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
        if (!littleEndian && !bigEndian) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "JPEG EXIF byte order is invalid");
        if (readUInt16(bytes, tiff + 2, littleEndian) !== 42) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "JPEG EXIF TIFF header is invalid");
        const ifd = tiff + readUInt32(bytes, tiff + 4, littleEndian);
        const entryCount = readUInt16(bytes, ifd, littleEndian);
        for (let index = 0; index < entryCount; index += 1) {
          const entry = ifd + 2 + index * 12;
          const tag = readUInt16(bytes, entry, littleEndian);
          if (tag !== 0x0112) continue;
          const type = readUInt16(bytes, entry + 2, littleEndian);
          const count = readUInt32(bytes, entry + 4, littleEndian);
          if (type !== 3 || count !== 1) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "JPEG EXIF Orientation type is invalid");
          const orientation = readUInt16(bytes, entry + 8, littleEndian);
          if (orientation < 1 || orientation > 8) throw new ImageInputError("KBR-EXIF-ORIENTATION-INVALID", "JPEG EXIF Orientation value is invalid");
          return orientation as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
        }
        return 1;
      }
    }
    offset += segmentLength;
  }
  return 1;
}

export async function inspectImageBytes(bytes: Uint8Array): Promise<ImageInputMetadata> {
  const detectedMimeType = detectImageMimeFromBytes(bytes);
  if (!detectedMimeType) throw new ImageInputError("KBR-ASSET-MIME-NOT-ALLOWED", "Only PNG and JPEG input bytes are supported");
  let exifOrientation: ImageInputMetadata["exifOrientation"] = 1;
  if (detectedMimeType === "image/jpeg") {
    if (bytes.byteLength < 4 || !Array.from(bytes).some((value, index) => value === 0xff && bytes[index + 1] === 0xd9)) {
      throw new ImageInputError("KBR-IMAGE-DECODE-FAILED", "JPEG SOI/EOI markers are incomplete");
    }
    exifOrientation = parseExifOrientation(bytes);
  }

  try {
    const decoded = sharp(Buffer.from(bytes), { failOn: "error" });
    const metadata = await decoded.metadata();
    if (metadata.format !== "png" && metadata.format !== "jpeg") {
      throw new ImageInputError("KBR-ASSET-MIME-NOT-ALLOWED", "Decoded image format is not PNG or JPEG");
    }
    const oriented = await sharp(Buffer.from(bytes), { failOn: "error" })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!oriented.info.width || !oriented.info.height || oriented.info.channels !== 4) {
      throw new ImageInputError("KBR-IMAGE-DIMENSION-INVALID", "Decoded image dimensions are invalid");
    }
    return {
      detectedMimeType,
      width: oriented.info.width,
      height: oriented.info.height,
      bytes: bytes.byteLength,
      hasAlpha: detectedMimeType === "image/png" ? metadata.hasAlpha === true : false,
      exifOrientation,
    };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("KBR-IMAGE-DECODE-FAILED", "Image bytes cannot be decoded");
  }
}

export async function inspectImageFile(filePath: string): Promise<InspectedImage> {
  const bytes = await readFile(filePath);
  const metadata = await inspectImageBytes(bytes);
  const expectedMimeType = mimeForImageExtension(filePath.slice(filePath.lastIndexOf(".")));
  if (!expectedMimeType) throw new ImageInputError("KBR-ASSET-MIME-NOT-ALLOWED", "Only .png, .jpg, and .jpeg extensions are supported");
  if (expectedMimeType !== metadata.detectedMimeType) {
    throw new ImageInputError("KBR-ASSET-MIME-EXTENSION-MISMATCH", "File extension does not match detected image MIME");
  }
  return { bytes, metadata };
}
