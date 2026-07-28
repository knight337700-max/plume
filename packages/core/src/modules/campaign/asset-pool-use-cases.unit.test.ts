import { describe, expect, it } from "vitest";
import { createCampaignAssetPoolUseCases } from "./asset-pool-use-cases.js";
import { createInMemoryCampaignRepositories } from "./repositories.js";

describe("campaign asset pool use cases", () => {
  it("rejects license-invalid preferred assets while retaining exclusions", async () => {
    const repositories = createInMemoryCampaignRepositories();
    await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", currentStep: "ASSET_POOL" });
    const pool = createCampaignAssetPoolUseCases(repositories);
    await expect(pool.select({ workspaceId: "ws-1", campaignId: "campaign-1", productId: "product-1", assetVersionId: "asset-v1", status: "SELECTED", licenseStatus: "EXPIRED" })).rejects.toMatchObject({ code: "ASSET_LICENSE_INVALID" });
    const excluded = await pool.select({ workspaceId: "ws-1", campaignId: "campaign-1", productId: "product-1", assetVersionId: "asset-v1", status: "EXCLUDED", licenseStatus: "EXPIRED", reason: "License expired" });
    expect(excluded).toMatchObject({ status: "EXCLUDED", reason: "License expired" });
    expect((await pool.get("ws-1", "campaign-1", "product-1")).selections).toHaveLength(1);
  });
});
