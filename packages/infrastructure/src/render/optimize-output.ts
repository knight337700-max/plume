import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { detectMimeType } from "../files/magic-byte.js";

export interface OptimizeOutputInput {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly maxBytes?: number | null;
}
export interface OptimizeOutputResult {
  readonly bytes: Uint8Array;
  readonly originalBytes: number;
  readonly optimizedBytes: number;
  readonly changed: boolean;
  readonly withinMaxBytes: boolean;
  readonly checksumSha256: string;
  readonly removedMetadata: boolean;
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const output = new Uint8Array(body.length + 8);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  output.set(body, 4);
  view.setUint32(output.length - 4, crc32(body));
  return output;
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function optimizePng(bytes: Uint8Array): {
  readonly bytes: Uint8Array;
  readonly removedMetadata: boolean;
} {
  if (!isPng(bytes) || detectMimeType(bytes) !== "image/png")
    throw new Error("PNG magic bytes are required");
  let offset = PNG_SIGNATURE.length;
  let header: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  let removedMetadata = false;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error("Invalid PNG chunk length");
    const data = bytes.slice(start, end);
    if (type === "IHDR") header = data;
    else if (type === "IDAT") idat.push(data);
    else if (type !== "IEND") removedMetadata = true;
    offset = end + 4;
    if (type === "IEND") break;
  }
  if (!header || !idat.length) throw new Error("PNG is missing IHDR or IDAT");
  const scanlines = inflateSync(Buffer.concat(idat.map((item) => Buffer.from(item))));
  const compressed = deflateSync(scanlines, { level: 9, memLevel: 9, strategy: 3 });
  const chunks = [
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(compressed)),
    chunk("IEND", new Uint8Array()),
  ];
  const output = new Uint8Array(
    PNG_SIGNATURE.length + chunks.reduce((total, item) => total + item.length, 0),
  );
  output.set(PNG_SIGNATURE);
  let writeOffset = PNG_SIGNATURE.length;
  for (const item of chunks) {
    output.set(item, writeOffset);
    writeOffset += item.length;
  }
  return { bytes: output, removedMetadata };
}

export function optimizeRenderOutput(input: OptimizeOutputInput): OptimizeOutputResult {
  if (input.mimeType !== "image/png")
    throw new Error("Only PNG optimization is available in the selected renderer");
  const optimized = optimizePng(input.bytes);
  const checksumSha256 = createHash("sha256").update(optimized.bytes).digest("hex");
  return {
    bytes: optimized.bytes,
    originalBytes: input.bytes.byteLength,
    optimizedBytes: optimized.bytes.byteLength,
    changed: !Buffer.from(input.bytes).equals(Buffer.from(optimized.bytes)),
    withinMaxBytes:
      input.maxBytes === undefined ||
      input.maxBytes === null ||
      optimized.bytes.byteLength <= input.maxBytes,
    checksumSha256,
    removedMetadata: optimized.removedMetadata,
  };
}
