import { describe, expect, it } from "vitest";
import { createBriefUseCases } from "./brief-use-cases.js";
import { createInMemoryCampaignRepositories } from "./repositories.js";

describe("campaign brief use cases", () => {
  it("keeps confirmed versions immutable and marks downstream work stale once", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({ workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", currentStep: "BRIEF" });
    const brief = createBriefUseCases(repositories);
    const version = await brief.createVersion({ workspaceId: "ws-1", campaignBriefId: campaign.id, sourceKind: "MANUAL", contentJson: { objective: "sell" } });
    const first = await brief.confirm("ws-1", version.id);
    const second = await brief.confirm("ws-1", version.id);
    expect(first.staleDownstream).toEqual({ matching: true, recommendations: true, generation: true });
    expect(second.staleDownstream).toEqual({ matching: false, recommendations: false, generation: false });
    expect((await brief.get("ws-1", campaign.id)).version?.status).toBe("CONFIRMED");
  });
});
