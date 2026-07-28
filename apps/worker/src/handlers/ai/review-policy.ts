import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface ReviewPolicyInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly validationRunId: string;
  readonly creativeVersionId: string;
  readonly renderFileId: string;
  readonly brief: Readonly<Record<string, unknown>>;
  readonly product: Readonly<Record<string, unknown>> | null;
  readonly rules: readonly Record<string, unknown>[];
  readonly deterministicResults: readonly PolicyFinding[];
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface PolicyFinding {
  readonly ruleCode: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly confidence: number;
  readonly targetElementIds: readonly string[];
  readonly evidence: readonly string[];
  readonly suggestedFix?: Readonly<Record<string, unknown>> | null;
}
export interface AIValidationOutput {
  readonly results: readonly PolicyFinding[];
}
const reviewSchema: JsonSchema = {
  type: "object",
  required: ["results"],
  additionalProperties: false,
  properties: { results: { type: "array" } },
};

function normalizeFindings(
  aiResults: readonly PolicyFinding[],
  deterministicResults: readonly PolicyFinding[],
): readonly PolicyFinding[] {
  const deterministicCodes = new Set(deterministicResults.map((finding) => finding.ruleCode));
  const normalized = aiResults
    .filter((finding) => !deterministicCodes.has(finding.ruleCode))
    .map((finding) =>
      finding.severity === "ERROR" && finding.confidence < 0.5
        ? { ...finding, severity: "WARNING" as const }
        : finding,
    );
  return Object.freeze([...deterministicResults, ...normalized]);
}

export function createPolicyReviewerHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
}) {
  return async (
    input: ReviewPolicyInput,
  ): Promise<
    AIWorkerResult<AIValidationOutput> & { readonly normalizedOutput: AIValidationOutput }
  > => {
    const agentResult = await dependencies.orchestrator.run<AIValidationOutput>({
      ...taskDefaults(
        "AI_POLICY_REVIEWER",
        input.taskId,
        input.workspaceId,
        input.creativeVersionId,
      ),
      subjectType: "CREATIVE_VERSION",
      data: {
        render: { renderFileId: input.renderFileId },
        brief: input.brief,
        product: input.product,
        rules: input.rules,
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? reviewSchema,
    });
    const output = assertCompleted(agentResult);
    return {
      status: "COMPLETED",
      agentResult,
      normalizedOutput: { results: normalizeFindings(output.results, input.deterministicResults) },
    };
  };
}
