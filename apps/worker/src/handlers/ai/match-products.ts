import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import type { ProductMatchingUseCases } from "../../../../../packages/core/src/modules/campaign/product-matching-use-cases.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface ProductMatchInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly briefVersionId: string;
  readonly extractedProducts: readonly {
    readonly sourceName: string;
    readonly context?: string | null;
  }[];
  readonly candidateProducts: readonly Record<string, unknown>[];
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface ProductMatchOutput {
  readonly matches: readonly {
    readonly sourceName: string;
    readonly candidates: readonly {
      readonly productId: string;
      readonly score: number;
      readonly reason: string;
    }[];
    readonly recommendedAction: "CONFIRM_TOP" | "REVIEW" | "CREATE_NEW" | "EXCLUDE";
  }[];
}
const productMatchSchema: JsonSchema = {
  type: "object",
  required: ["matches"],
  additionalProperties: false,
  properties: { matches: { type: "array" } },
};

export function createProductMatcherHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly matching: ProductMatchingUseCases;
  readonly outputSchema?: JsonSchema;
}) {
  return async (input: ProductMatchInput): Promise<AIWorkerResult<ProductMatchOutput>> => {
    const agentResult = await dependencies.orchestrator.run<ProductMatchOutput>({
      ...taskDefaults("PRODUCT_MATCHER", input.taskId, input.workspaceId, input.campaignId),
      data: { extractedProducts: input.extractedProducts, candidates: input.candidateProducts },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? productMatchSchema,
    });
    const output = assertCompleted(agentResult);
    const candidates = output.matches.flatMap((match) =>
      match.candidates.map((candidate) => ({
        productId: candidate.productId,
        score: candidate.score,
        rationale: `${match.sourceName}: ${candidate.reason}`,
      })),
    );
    await dependencies.matching.run(
      input.workspaceId,
      input.campaignId,
      input.briefVersionId,
      candidates,
    );
    return { status: "REVIEW_REQUIRED", agentResult };
  };
}
