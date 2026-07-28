import { describe, expect, it } from "vitest";
import { createProductMatchingUseCases } from "./product-matching-use-cases.js";
import { createInMemoryCampaignRepositories } from "./repositories.js";

describe("product matching use cases", () => {
  it("stores AI candidates without confirming them and confirms against the current brief", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", currentStep: "PRODUCT_MATCHING" });
    const version = await repositories.createBriefVersion({ workspaceId: "ws-1", campaignBriefId: campaign.id, sourceKind: "MANUAL", contentJson: {}, status: "CONFIRMED" });
    await repositories.confirmBriefVersion("ws-1", version.id);
    const matching = createProductMatchingUseCases(repositories);
    const candidates = await matching.run("ws-1", campaign.id, version.id, [{ productId: "p1", score: 0.9 }, { productId: "p2", score: 0.8 }, { productId: "p3", score: 0.7 }]);
    expect(candidates.every((candidate) => !candidate.confirmed)).toBe(true);
    const confirmed = await matching.confirm("ws-1", campaign.id, version.id, [{ productId: "p1", status: "CONFIRMED" }, { productId: "p2", status: "REJECTED" }]);
    expect(confirmed).toHaveLength(2);
    await expect(matching.confirm("ws-1", campaign.id, "old-brief", [{ productId: "p3", status: "CONFIRMED" }])).rejects.toMatchObject({ code: "BRIEF_VERSION_STALE" });
  });
});
