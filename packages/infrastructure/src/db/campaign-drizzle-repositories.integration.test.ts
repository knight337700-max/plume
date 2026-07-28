import { describe, expect, it } from "vitest";
import { createInMemoryCampaignRepositories } from "../../../core/src/modules/campaign/repositories.js";

describe("campaign repository fixture", () => {
  it("keeps tenant-scoped selections and generation checkpoints", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", currentStep: "BRIEF" });
    await repositories.upsertChannelSelection({ workspaceId: "ws-1", campaignId: campaign.id, channelCode: "KAKAO_MOMENT", status: "SELECTED", snapshotJson: { versionId: "channel-v1" } });
    const aggregate = await repositories.createGenerationAggregate({ workspaceId: "ws-1", campaignId: campaign.id, briefVersionId: "brief-v1", estimatedItemCount: 1 }, [{ workspaceId: "ws-1", generationRequestId: "ignored", productId: "product-1", formatProfileId: "format-v1", variantKey: "default", checkpointJson: { stage: "QUEUED" } }]);
    expect((await repositories.listChannelSelections("ws-1", campaign.id))).toHaveLength(1);
    await expect(repositories.listChannelSelections("ws-2", campaign.id)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect((await repositories.getGenerationRequest("ws-1", aggregate.request.id))?.items[0]?.checkpointJson).toMatchObject({ stage: "QUEUED" });
  });
});
