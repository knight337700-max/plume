import { describe, expect, it } from "vitest";
import { createThumbnail } from "./create-thumbnail.js";

describe("deterministic thumbnail generation", () => {
  it("normalizes orientation and keeps the checksum stable for the same input/config", () => {
    const source = new TextEncoder().encode("image-source");
    const config = { width: 320, height: 180, format: "WEBP" as const, quality: 80, fit: "CONTAIN" as const, orientation: 6 };
    const first = createThumbnail(source, "image/jpeg", config);
    const second = createThumbnail(source, "image/jpeg", config);
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.metadataJson).toMatchObject({ orientation: 1, deterministic: true });
  });
});
