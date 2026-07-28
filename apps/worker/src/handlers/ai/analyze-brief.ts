import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { BriefUseCases } from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface AnalyzeBriefInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly sourceIds: readonly string[];
  readonly brandProfile: Readonly<Record<string, unknown>>;
  readonly locale?: "ko-KR";
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface CampaignAnalysisOutput {
  readonly objective: string;
  readonly targets: readonly string[];
  readonly benefits: readonly string[];
  readonly brandMessage: string | null;
  readonly campaignMessages: readonly string[];
  readonly products: readonly { readonly sourceName: string; readonly context?: string | null }[];
  readonly forbiddenExpressions: readonly string[];
  readonly citations: readonly {
    readonly sourceId: string;
    readonly excerptHash: string;
    readonly location?: string | null;
  }[];
  readonly confidence: number;
  readonly uncertainties?: readonly string[];
}
const campaignAnalysisSchema: JsonSchema = {
  type: "object",
  required: [
    "objective",
    "targets",
    "benefits",
    "brandMessage",
    "campaignMessages",
    "products",
    "forbiddenExpressions",
    "citations",
    "confidence",
  ],
  additionalProperties: false,
  properties: {
    objective: { type: "string", minLength: 1 },
    targets: { type: "array" },
    benefits: { type: "array" },
    brandMessage: { type: ["string", "null"] },
    campaignMessages: { type: "array" },
    products: { type: "array" },
    forbiddenExpressions: { type: "array" },
    citations: { type: "array" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    uncertainties: { type: "array" },
  },
};

export function createCampaignAnalystHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly briefs: BriefUseCases;
  readonly outputSchema?: JsonSchema;
}) {
  return async (input: AnalyzeBriefInput): Promise<AIWorkerResult<CampaignAnalysisOutput>> => {
    const agentResult = await dependencies.orchestrator.run<CampaignAnalysisOutput>({
      ...taskDefaults("CAMPAIGN_ANALYST", input.taskId, input.workspaceId, input.campaignId),
      locale: input.locale ?? "ko-KR",
      data: { sourceIds: input.sourceIds, brandProfile: input.brandProfile },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? campaignAnalysisSchema,
    });
    const output = assertCompleted(agentResult);
    const version = await dependencies.briefs.createVersion({
      workspaceId: input.workspaceId,
      campaignBriefId: input.campaignId,
      sourceKind: "AI_ANALYSIS",
      contentJson: output as unknown as Record<string, unknown>,
      sourceCitationsJson: output.citations,
      brandProfileSnapshotJson: input.brandProfile,
      createdBy: "AI:CAMPAIGN_ANALYST",
    });
    return { status: "REVIEW_REQUIRED", agentResult, persistedId: version.id };
  };
}
