import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createCampaignAssetPoolUseCases } from "../../../../../packages/core/src/modules/campaign/asset-pool-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { createAssetCuratorHandler } from "./recommend-assets.js";

describe("asset curator handler", () => {
  it("persists per-product rankings and preserves license risk without selecting assets", async () => {
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({
      workspaceId: "workspace-1",
      brandId: "brand-1",
      displayCode: "C-1",
      name: "JACOMO",
      objectiveCode: "SALES",
      currentStep: "ASSETS",
    });
    const output = {
      productId: "product-1",
      rankedAssets: [
        {
          assetVersionId: "asset-version-1",
          score: 0.4,
          reasons: ["low resolution"],
          risks: ["EXPIRED_LICENSE"],
          recommendedUsage: "DO_NOT_USE" as const,
        },
      ],
    };
    const gateway: AgentProviderGateway = {
      execute: async () => ({ status: "COMPLETED", outputJson: output, latencyMs: 1 }),
    };
    const handler = createAssetCuratorHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
      assetPool: createCampaignAssetPoolUseCases(repositories),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      campaignId: campaign.id,
      productId: "product-1",
      channel: { code: "KAKAO_MOMENT" },
      formatProfile: { id: "kakao" },
      brief: { objective: "sales" },
      assets: [{ assetVersionId: "asset-version-1", licenseStatus: "EXPIRED" }],
      messages: [{ role: "user", content: "Rank." }],
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    const pool = await createCampaignAssetPoolUseCases(repositories).get(
      "workspace-1",
      campaign.id,
      "product-1",
    );
    expect(pool.recommendations[0]).toMatchObject({
      licenseStatus: "EXPIRED",
      status: "RECOMMENDED",
    });
    expect(pool.selections).toHaveLength(0);
  });
});
