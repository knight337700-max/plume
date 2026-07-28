export interface ImageDimensions {
  width: number;
  height: number;
  alpha: boolean;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => signature.every((value, index) => bytes[index] === value);

export function detectMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export function imageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  if (mimeType === "image/png" && bytes.byteLength >= 26 && detectMimeType(bytes) === mimeType) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const colorType = bytes[25];
    return { width, height, alpha: colorType === 4 || colorType === 6 };
  }
  if (mimeType === "image/jpeg" && detectMimeType(bytes) === mimeType) return jpegDimensions(bytes);
  return null;
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return null;
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, segmentLength);
      return { width: view.getUint16(5), height: view.getUint16(3), alpha: false };
    }
    offset += segmentLength;
  }
  return null;
}

export function assertMimeMagic(bytes: Uint8Array, declaredMimeType: string): void {
  const detected = detectMimeType(bytes);
  if (declaredMimeType.startsWith("image/") && detected !== declaredMimeType) {
    const error = new Error(`File magic bytes do not match ${declaredMimeType}`);
    Object.assign(error, { code: "MIME_MAGIC_MISMATCH", statusCode: 422, detectedMimeType: detected });
    throw error;
  }
  if (detected && detected !== declaredMimeType && declaredMimeType !== "application/octet-stream") {
    const error = new Error(`File magic bytes identify ${detected}, not ${declaredMimeType}`);
    Object.assign(error, { code: "MIME_MAGIC_MISMATCH", statusCode: 422, detectedMimeType: detected });
    throw error;
  }
}
