import { createHash } from "node:crypto";
import { assertMimeMagic, imageDimensions } from "./magic-byte.js";

export interface UploadVerificationInput {
  readonly session: { readonly objectKey: string; readonly bytes: number; readonly mimeType: string };
  readonly checksumSha256: string;
  readonly parts: readonly { partNumber: number; etag: string }[];
}

export interface UploadVerificationResult {
  readonly checksumSha256: string;
  readonly bytes: number;
  readonly metadataJson?: Readonly<Record<string, unknown>>;
}

export interface UploadVerifier {
  verify(input: UploadVerificationInput): Promise<UploadVerificationResult>;
}

export interface VerifyUploadInput {
  readonly bytes: Uint8Array;
  readonly declaredChecksumSha256: string;
  readonly expectedBytes: number;
  readonly mimeType: string;
}

export interface VerifyUploadOptions {
  readonly maxBytes?: number;
  readonly maxPixels?: number;
}

export interface VerifiedUpload extends UploadVerificationResult {
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly alpha?: boolean;
}

export function verifyUpload(input: VerifyUploadInput, options: VerifyUploadOptions = {}): VerifiedUpload {
  const maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
  const maxPixels = options.maxPixels ?? 100_000_000;
  if (input.bytes.byteLength > maxBytes) throw uploadVerificationError("UPLOAD_TOO_LARGE", "Upload exceeds the configured byte limit");
  if (input.bytes.byteLength !== input.expectedBytes) throw uploadVerificationError("SIZE_MISMATCH", "Upload byte count does not match the declared size");
  const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (checksumSha256 !== input.declaredChecksumSha256) throw uploadVerificationError("CHECKSUM_MISMATCH", "Upload checksum does not match the declared checksum");
  assertMimeMagic(input.bytes, input.mimeType);
  const dimensions = imageDimensions(input.bytes, input.mimeType);
  if (dimensions && dimensions.width * dimensions.height > maxPixels) throw uploadVerificationError("IMAGE_PIXEL_LIMIT", "Image dimensions exceed the decompression bomb limit");
  return {
    checksumSha256,
    bytes: input.bytes.byteLength,
    mimeType: input.mimeType,
    width: dimensions?.width,
    height: dimensions?.height,
    alpha: dimensions?.alpha,
    metadataJson: { detectedMimeType: input.mimeType, width: dimensions?.width ?? null, height: dimensions?.height ?? null, alpha: dimensions?.alpha ?? null },
  };
}

export interface UploadByteSource {
  read(objectKey: string): Promise<Uint8Array>;
}

export function createUploadVerifier(source: UploadByteSource, options: VerifyUploadOptions = {}): UploadVerifier {
  return {
    async verify(input: UploadVerificationInput): Promise<UploadVerificationResult> {
      const bytes = await source.read(input.session.objectKey);
      return verifyUpload({ bytes, declaredChecksumSha256: input.checksumSha256, expectedBytes: input.session.bytes, mimeType: input.session.mimeType }, options);
    },
  };
}

export function uploadVerificationError(code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 422 });
  return error;
}

export function uploadSessionToVerificationInput(session: { readonly bytes: number; readonly mimeType: string }, bytes: Uint8Array, checksumSha256: string): VerifyUploadInput {
  return { bytes, declaredChecksumSha256: checksumSha256, expectedBytes: session.bytes, mimeType: session.mimeType };
}
