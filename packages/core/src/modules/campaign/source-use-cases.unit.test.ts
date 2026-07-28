import { describe, expect, it } from "vitest";
import { createCampaignSourceUseCases } from "./source-use-cases.js";
import { createInMemoryCampaignRepositories } from "./repositories.js";

describe("campaign source use cases", () => {
  it("attaches only completed file objects and excludes removed sources from analysis", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", currentStep: "SOURCES" });
    const sources = createCampaignSourceUseCases({ repositories, files: { async getFile(_workspaceId, fileObjectId) { return { id: fileObjectId, workspaceId: "ws-1", status: fileObjectId === "pending" ? "PENDING" : "COMPLETED" }; } } });
    await expect(sources.attach({ workspaceId: "ws-1", campaignId: campaign.id, fileObjectId: "pending", sourceType: "UPLOAD" })).rejects.toMatchObject({ code: "FILE_NOT_COMPLETED" });
    const attached = await sources.attach({ workspaceId: "ws-1", campaignId: campaign.id, fileObjectId: "file-1", sourceType: "UPLOAD" });
    await sources.remove("ws-1", campaign.id, attached.id);
    expect(await sources.activeForAnalysis("ws-1", campaign.id)).toHaveLength(0);
    expect(await sources.list("ws-1", campaign.id, true)).toHaveLength(1);
  });
});
