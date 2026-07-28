import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createBriefUseCases } from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { createCampaignAnalystHandler } from "./analyze-brief.js";

describe("campaign analyst handler", () => {
  it("persists a review-required draft brief with citations without confirming it", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({
      workspaceId: "workspace-1",
      brandId: "brand-1",
      displayCode: "C-1",
      name: "JACOMO",
      objectiveCode: "SALES",
      currentStep: "SOURCES",
    });
    const output = {
      objective: "sales",
      targets: ["women"],
      benefits: ["soft"],
      brandMessage: "warm",
      campaignMessages: ["new"],
      products: [{ sourceName: "serum" }],
      forbiddenExpressions: [],
      citations: [{ sourceId: "source-1", excerptHash: "hash-1", location: "page-1" }],
      confidence: 0.8,
      uncertainties: ["period"],
    };
    const gateway: AgentProviderGateway = {
      execute: async () => ({ status: "COMPLETED", outputJson: output, latencyMs: 1 }),
    };
    const handler = createCampaignAnalystHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
      briefs: createBriefUseCases(repositories),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      campaignId: campaign.id,
      sourceIds: ["source-1"],
      brandProfile: { tone: "warm" },
      messages: [{ role: "user", content: "Analyze." }],
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    const brief = await createBriefUseCases(repositories).get("workspace-1", campaign.id);
    expect(brief.version?.status).toBe("DRAFT");
    expect(brief.version?.sourceCitationsJson).toHaveLength(1);
  });
});
