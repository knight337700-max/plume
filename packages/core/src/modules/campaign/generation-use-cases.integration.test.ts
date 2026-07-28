import { describe, expect, it } from "vitest";
import { createGenerationUseCases } from "./generation-use-cases.js";
import { createInMemoryCampaignRepositories } from "./repositories.js";

describe("generation request use cases", () => {
  it("creates one checkpointable item per product x format x variant atomically", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Jacomo", objectiveCode: "SALES", currentStep: "MEDIA_SELECTION" });
    const brief = await repositories.createBriefVersion({ workspaceId: "ws-1", campaignBriefId: campaign.id, sourceKind: "MANUAL", contentJson: {}, status: "CONFIRMED" });
    await repositories.confirmBriefVersion("ws-1", brief.id);
    const generation = createGenerationUseCases(repositories);
    const aggregate = await generation.create({ workspaceId: "ws-1", campaignId: campaign.id, briefVersionId: brief.id, products: [{ productId: "p1" }, { productId: "p2" }, { productId: "p3" }], formatProfileIds: ["format-1"] });
    expect(aggregate.request.estimatedItemCount).toBe(3);
    expect(aggregate.items).toHaveLength(3);
    expect(aggregate.items.every((item) => item.status === "QUEUED" && item.checkpointJson.stage === "QUEUED")).toBe(true);
  });
});
