import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { detectMimeType, imageDimensions } from "./magic-byte.js";
import { verifyUpload } from "./verify-upload.js";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const checksum = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("upload verification", () => {
  it("checks PNG magic bytes, checksum and dimensions", () => {
    expect(detectMimeType(png)).toBe("image/png");
    expect(imageDimensions(png, "image/png")).toMatchObject({ width: 1, height: 1 });
    const result = verifyUpload({ bytes: png, declaredChecksumSha256: checksum(png), expectedBytes: png.byteLength, mimeType: "image/png" });
    expect(result).toMatchObject({ bytes: png.byteLength, width: 1, height: 1 });
  });

  it("rejects checksum, MIME and decompression-bomb failures", () => {
    expect(() => verifyUpload({ bytes: png, declaredChecksumSha256: "bad", expectedBytes: png.byteLength, mimeType: "image/png" })).toThrowError(/checksum/i);
    expect(() => verifyUpload({ bytes: png, declaredChecksumSha256: checksum(png), expectedBytes: png.byteLength, mimeType: "image/jpeg" })).toThrowError(/magic/i);
    try {
      verifyUpload({ bytes: png, declaredChecksumSha256: checksum(png), expectedBytes: png.byteLength, mimeType: "image/png" }, { maxPixels: 0 });
      throw new Error("expected pixel limit failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "IMAGE_PIXEL_LIMIT" });
    }
  });
});
