import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createProductMatchingUseCases } from "../../../../../packages/core/src/modules/campaign/product-matching-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { createProductMatcherHandler } from "./match-products.js";

describe("product matcher handler", () => {
  it("persists scored candidates without confirming campaign products", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({
      workspaceId: "workspace-1",
      brandId: "brand-1",
      displayCode: "C-1",
      name: "JACOMO",
      objectiveCode: "SALES",
      currentStep: "MATCHING",
    });
    const output = {
      matches: [
        {
          sourceName: "serum",
          candidates: [{ productId: "product-1", score: 0.94, reason: "name and benefit match" }],
          recommendedAction: "CONFIRM_TOP" as const,
        },
      ],
    };
    const gateway: AgentProviderGateway = {
      execute: async () => ({ status: "COMPLETED", outputJson: output, latencyMs: 1 }),
    };
    const handler = createProductMatcherHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
      matching: createProductMatchingUseCases(repositories),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      campaignId: campaign.id,
      briefVersionId: "brief-version-1",
      extractedProducts: [{ sourceName: "serum" }],
      candidateProducts: [{ productId: "product-1", name: "Serum" }],
      messages: [{ role: "user", content: "Match." }],
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    const matching = await createProductMatchingUseCases(repositories).get(
      "workspace-1",
      campaign.id,
    );
    expect(matching.candidates).toHaveLength(1);
    expect(matching.candidates[0]?.confirmed).toBe(false);
    expect(matching.products).toHaveLength(0);
  });
});
