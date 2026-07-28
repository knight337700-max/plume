import { describe, expect, it } from "vitest";
import { createAssetUseCases } from "./asset-use-cases.js";
import { createInMemoryAssetRepositories } from "./repositories.js";

describe("asset use cases", () => {
  it("creates immutable versions, links products and exposes license status", async () => {
    const assets = createAssetUseCases(createInMemoryAssetRepositories());
    const asset = await assets.create({ workspaceId: "ws-1", brandId: "brand-1", name: "Hero", assetType: "IMAGE", licenseStatus: "VALID" });
    const version = await assets.createVersion({ workspaceId: "ws-1", assetId: asset.id, fileObjectId: "file-1", sourceType: "UPLOAD" });
    await expect(assets.createVersion({ workspaceId: "ws-1", assetId: asset.id, fileObjectId: "file-2", sourceType: "UPLOAD" })).resolves.toMatchObject({ versionNo: 2 });
    await expect(assets.linkProduct({ workspaceId: "ws-1", productId: "product-1", assetVersionId: version.id, isPrimary: true, sortOrder: 0 })).resolves.toMatchObject({ assetVersionId: version.id });
    expect((await assets.get("ws-1", asset.id))?.licenseStatus).toBe("VALID");
    await expect(assets.update("ws-1", asset.id, { name: "New" }, 1)).rejects.toMatchObject({ code: "REVISION_MISMATCH" });
  });
});
