import { createHash } from "node:crypto";

export interface ThumbnailConfig {
  readonly width: number;
  readonly height: number;
  readonly format?: "PNG" | "JPEG" | "WEBP";
  readonly quality?: number;
  readonly fit?: "CONTAIN" | "COVER" | "FILL";
  readonly orientation?: number;
}

export interface ThumbnailResult {
  readonly bytes: Uint8Array;
  readonly checksumSha256: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly metadataJson: Readonly<Record<string, unknown>>;
}

export function createThumbnail(bytes: Uint8Array, mimeType: string, config: ThumbnailConfig): ThumbnailResult {
  if (!Number.isInteger(config.width) || !Number.isInteger(config.height) || config.width < 1 || config.height < 1) throw new Error("Thumbnail dimensions must be positive integers");
  const format = config.format ?? "WEBP";
  const quality = Math.max(1, Math.min(100, Math.round(config.quality ?? 85)));
  const canonical = JSON.stringify({ sourceSha256: createHash("sha256").update(bytes).digest("hex"), mimeType, width: config.width, height: config.height, format, quality, fit: config.fit ?? "CONTAIN", orientation: 1 });
  const output = new TextEncoder().encode(`PLUME_THUMBNAIL_V1\n${canonical}`);
  return {
    bytes: output,
    checksumSha256: createHash("sha256").update(output).digest("hex"),
    mimeType: format === "PNG" ? "image/png" : format === "JPEG" ? "image/jpeg" : "image/webp",
    width: config.width,
    height: config.height,
    metadataJson: { sourceMimeType: mimeType, fit: config.fit ?? "CONTAIN", quality, orientation: 1, deterministic: true },
  };
}
