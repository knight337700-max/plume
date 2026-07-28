import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "./s3-object-storage.js";

describe("S3 object storage", () => {
  it("uploads to private MinIO storage and reads the object through a short-lived presigned URL", async () => {
    const storage = new S3ObjectStorage({
      endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      bucket: `plume-gate-c-${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      accessKeyId: process.env.MINIO_ROOT_USER ?? "plume",
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? "plume_local_only",
    });
    const body = new TextEncoder().encode("gate-c-minio-round-trip");
    const stored = await storage.put({ body, contentType: "text/plain" });
    const head = await storage.head(stored.objectKey);
    expect(head?.bytes).toBe(body.byteLength);
    const signed = await storage.presign(stored.objectKey, { expiresInSeconds: 60 });
    const response = await fetch(signed.url);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("gate-c-minio-round-trip");
    await storage.deleteTemp(stored.objectKey);
  });
});
