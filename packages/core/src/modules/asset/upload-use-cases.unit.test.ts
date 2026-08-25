import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDeterministicUploadStorage, createUploadUseCases } from "./upload-use-cases.js";

const checksum = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("upload session use cases", () => {
  it("creates the file object only after verified completion and makes completion idempotent", async () => {
    const useCases = createUploadUseCases({
      storage: createDeterministicUploadStorage(),
      bucket: "private",
      now: () => new Date("2026-07-28T00:00:00.000Z"),
    });
    const session = await useCases.create({
      workspaceId: "ws-1",
      filename: "product.png",
      mimeType: "image/png",
      bytes: 5,
      purpose: "ASSET",
    });

    expect(session.status).toBe("CREATED");
    await expect(useCases.getFile("ws-1", "not-created")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
    const file = await useCases.complete({
      workspaceId: "ws-1",
      uploadId: session.id,
      checksumSha256: checksum("image"),
    });
    const repeated = await useCases.complete({
      workspaceId: "ws-1",
      uploadId: session.id,
      checksumSha256: checksum("image"),
    });

    expect(file.id).toBe(repeated.id);
    expect((await useCases.get("ws-1", session.id)).status).toBe("COMPLETED");
  });

  it("supports multipart parts and keeps abort idempotent", async () => {
    const useCases = createUploadUseCases({
      storage: createDeterministicUploadStorage(),
      bucket: "private",
    });
    const session = await useCases.create({
      workspaceId: "ws-1",
      filename: "catalog.csv",
      mimeType: "text/csv",
      bytes: 12,
      purpose: "IMPORT",
      multipartPreferred: true,
    });

    await expect(useCases.createParts("ws-1", session.id, [1, 1])).rejects.toMatchObject({
      code: "INVALID_PARTS",
    });
    const first = await useCases.createParts("ws-1", session.id, [2, 1]);
    const second = await useCases.createParts("ws-1", session.id, [2, 3]);
    expect(first.parts.map((part) => part.partNumber)).toEqual([1, 2]);
    expect(second.parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    await expect(
      useCases.complete({
        workspaceId: "ws-1",
        uploadId: session.id,
        checksumSha256: checksum("catalog"),
      }),
    ).rejects.toMatchObject({ code: "MISSING_UPLOAD_PARTS" });

    const aborted = await useCases.create({
      workspaceId: "ws-1",
      filename: "discard.txt",
      mimeType: "text/plain",
      bytes: 1,
      purpose: "ASSET",
    });
    await useCases.abort("ws-1", aborted.id);
    await useCases.abort("ws-1", aborted.id);
    expect((await useCases.get("ws-1", aborted.id)).status).toBe("ABORTED");
  });

  it("enforces the configured MIME, filename, and byte policy before signing", async () => {
    const useCases = createUploadUseCases({
      storage: createDeterministicUploadStorage(),
      bucket: "private",
      filePolicy: { allowedMimeTypes: ["image/png"], maxBytes: 10, maxPixels: 100 },
    });
    await expect(
      useCases.create({
        workspaceId: "ws-1",
        filename: "x.txt",
        mimeType: "text/plain",
        bytes: 1,
        purpose: "ASSET",
      }),
    ).rejects.toMatchObject({ code: "MIME_TYPE_NOT_ALLOWED" });
    await expect(
      useCases.create({
        workspaceId: "ws-1",
        filename: "../x.png",
        mimeType: "image/png",
        bytes: 1,
        purpose: "ASSET",
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILENAME" });
    await expect(
      useCases.create({
        workspaceId: "ws-1",
        filename: "x.png",
        mimeType: "image/png",
        bytes: 11,
        purpose: "ASSET",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
  });

  it("scopes generated object keys to the workspace", async () => {
    const useCases = createUploadUseCases({
      storage: createDeterministicUploadStorage(),
      bucket: "private",
    });
    const session = await useCases.create({
      workspaceId: "ws-1",
      filename: "x.png",
      mimeType: "image/png",
      bytes: 1,
      purpose: "ASSET",
    });
    expect(session.objectKeyToken).toMatch(/^workspaces\/ws-1\//u);
    await expect(useCases.get("ws-2", session.id)).rejects.toMatchObject({
      code: "UPLOAD_NOT_FOUND",
    });
  });
});
