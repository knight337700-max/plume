import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "./s3-object-storage.js";

describe("S3 object key scope", () => {
  const storage = new S3ObjectStorage({
    endpoint: "https://storage.example.test",
    bucket: "private",
    accessKeyId: "access",
    secretAccessKey: "secret",
  });

  it("rejects traversal and empty path segments before any network request", async () => {
    await expect(storage.presign("../other-workspace/file.txt")).rejects.toMatchObject({
      code: "INVALID_OBJECT_KEY",
    });
    await expect(storage.presign("workspaces/ws-a//file.txt")).rejects.toMatchObject({
      code: "INVALID_OBJECT_KEY",
    });
  });

  it("does not allow deletion outside temporary scoped prefixes", async () => {
    await expect(storage.deleteTemp("workspaces/ws-a/renders/file.png")).rejects.toMatchObject({
      code: "INVALID_TEMP_OBJECT_KEY",
    });
  });
});
