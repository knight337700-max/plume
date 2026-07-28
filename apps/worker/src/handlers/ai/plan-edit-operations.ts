import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface PlanEditOperationsInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly commandText: string;
  readonly creativeDocument: Readonly<Record<string, unknown>>;
  readonly latestValidationResults?: readonly Record<string, unknown>[];
  readonly availableAssets?: readonly Record<string, unknown>[];
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface EditOperationBatchOutput {
  readonly operations: readonly {
    readonly operationId: string;
    readonly action:
      | "MOVE"
      | "RESIZE"
      | "REPLACE_ASSET"
      | "UPDATE_TEXT"
      | "CHANGE_STYLE"
      | "REORDER"
      | "DELETE"
      | "ADD";
    readonly targetIds: readonly string[];
    readonly payload: Readonly<Record<string, unknown>>;
    readonly explanation?: string;
  }[];
  readonly summary: string;
  readonly requiresAssetSelection: boolean;
  readonly requiresUserConfirmation: boolean;
  readonly assetSelectionOptions?: readonly string[];
  readonly warnings?: readonly string[];
}
const editSchema: JsonSchema = {
  type: "object",
  required: ["operations", "summary", "requiresAssetSelection", "requiresUserConfirmation"],
  additionalProperties: false,
  properties: {
    operations: { type: "array" },
    summary: { type: "string", minLength: 1 },
    requiresAssetSelection: { type: "boolean" },
    requiresUserConfirmation: { type: "boolean" },
    assetSelectionOptions: { type: "array" },
    warnings: { type: "array" },
  },
};
const HIGH_IMPACT = new Set(["REPLACE_ASSET", "DELETE", "CHANGE_STYLE"]);

export function createNaturalLanguageEditorHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
}) {
  return async (
    input: PlanEditOperationsInput,
  ): Promise<AIWorkerResult<EditOperationBatchOutput>> => {
    const agentResult = await dependencies.orchestrator.run<EditOperationBatchOutput>({
      ...taskDefaults(
        "NATURAL_LANGUAGE_EDITOR",
        input.taskId,
        input.workspaceId,
        input.creativeVersionId,
      ),
      subjectType: "CREATIVE_VERSION",
      data: {
        creativeDocument: input.creativeDocument,
        editRequest: input.commandText,
        validation: input.latestValidationResults ?? [],
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? editSchema,
    });
    const output = assertCompleted(agentResult);
    const highImpact = output.operations.some(
      (operation) =>
        HIGH_IMPACT.has(operation.action) ||
        (operation.action === "RESIZE" &&
          Object.values(operation.payload).some(
            (value) => typeof value === "number" && Math.abs(value) > 0.1,
          )),
    );
    if (highImpact && !output.requiresUserConfirmation)
      throw new Error("HIGH_IMPACT_EDIT_REQUIRES_CONFIRMATION");
    return { status: "REVIEW_REQUIRED", agentResult };
  };
}
