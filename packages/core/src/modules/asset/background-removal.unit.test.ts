import { describe, expect, it } from "vitest";
import { createBackgroundRemovalUseCase } from "./background-removal.js";

describe("background removal", () => {
  it("always persists a new asset version for a provider result", async () => {
    const created: unknown[] = [];
    const useCase = createBackgroundRemovalUseCase({
      provider: { async remove(input) { return { bytes: input.bytes, mimeType: input.mimeType, metadataJson: { provider: "mock" } }; } },
      versions: { async createVersion(input) { created.push(input); return { id: "new-version" }; } },
      outputFileObjectId: async () => "new-file",
    });
    const result = await useCase.execute({ workspaceId: "ws-1", assetId: "asset-1", sourceVersionId: "version-1", sourceFileObjectId: "file-1", bytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(result).toEqual({ versionId: "new-version", fileObjectId: "new-file" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ sourceType: "BACKGROUND_REMOVAL", fileObjectId: "new-file" });
  });

  it("surfaces disabled provider errors without creating a version", async () => {
    const error = Object.assign(new Error("disabled"), { code: "BACKGROUND_REMOVAL_DISABLED" });
    const useCase = createBackgroundRemovalUseCase({ provider: { async remove() { throw error; } }, versions: { async createVersion() { throw new Error("must not be called"); } }, outputFileObjectId: async () => "unused" });
    await expect(useCase.execute({ workspaceId: "ws-1", assetId: "asset-1", sourceVersionId: "version-1", sourceFileObjectId: "file-1", bytes: new Uint8Array([1]), mimeType: "image/png" })).rejects.toMatchObject({ code: "BACKGROUND_REMOVAL_DISABLED" });
  });
});
