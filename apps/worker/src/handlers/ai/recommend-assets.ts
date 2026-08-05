import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import type { CampaignAssetPoolUseCases } from "../../../../../packages/core/src/modules/campaign/asset-pool-use-cases.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface RecommendAssetsInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly productId: string;
  readonly channel: Readonly<Record<string, unknown>>;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly brief: Readonly<Record<string, unknown>>;
  readonly assets: readonly Record<string, unknown>[];
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface AssetRecommendationOutput {
  readonly productId: string;
  readonly rankedAssets: readonly {
    readonly assetVersionId: string;
    readonly score: number;
    readonly reasons: readonly string[];
    readonly risks: readonly string[];
    readonly recommendedUsage: "PRIMARY" | "SECONDARY" | "BACKGROUND" | "LOGO" | "DO_NOT_USE";
  }[];
}
const assetRecommendationSchema: JsonSchema = {
  type: "object",
  required: ["productId", "rankedAssets"],
  additionalProperties: false,
  properties: { productId: { type: "string" }, rankedAssets: { type: "array" } },
};

export function createAssetCuratorHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly assetPool: CampaignAssetPoolUseCases;
  readonly outputSchema?: JsonSchema;
}) {
  return async (
    input: RecommendAssetsInput,
  ): Promise<AIWorkerResult<AssetRecommendationOutput>> => {
    const agentResult = await dependencies.orchestrator.run<AssetRecommendationOutput>({
      ...taskDefaults("ASSET_CURATOR", input.taskId, input.workspaceId, input.campaignId),
      data: {
        product: { productId: input.productId },
        channel: input.channel,
        formatProfile: input.formatProfile,
        brief: input.brief,
        assets: input.assets,
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? assetRecommendationSchema,
    });
    const output = assertCompleted(agentResult);
    await dependencies.assetPool.recommend(
      input.workspaceId,
      input.campaignId,
      input.productId,
      output.rankedAssets.map((asset) => ({
        assetVersionId: asset.assetVersionId,
        score: asset.score,
        rationale: [...asset.reasons, ...asset.risks.map((risk) => `RISK:${risk}`)].join("; "),
        licenseStatus: String(
          input.assets.find((candidate) => candidate.assetVersionId === asset.assetVersionId)
            ?.licenseStatus ?? "UNKNOWN",
        ),
      })),
    );
    return { status: "REVIEW_REQUIRED", agentResult };
  };
}
