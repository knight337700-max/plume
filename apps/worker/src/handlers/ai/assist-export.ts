import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface AssistExportInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly exportJobId: string;
  readonly campaign: Readonly<Record<string, unknown>>;
  readonly channel: Readonly<Record<string, unknown>>;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly creativeVersions: readonly Record<string, unknown>[];
  readonly exportRecipe: Readonly<Record<string, unknown>>;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface ExportAssistantOutput {
  readonly items: readonly {
    readonly creativeVersionId: string;
    readonly relativePath: string;
    readonly fileBaseName: string;
  }[];
  readonly packageName: string;
  readonly notes: readonly string[];
}
const exportSchema: JsonSchema = {
  type: "object",
  required: ["items", "packageName", "notes"],
  additionalProperties: false,
  properties: {
    items: { type: "array" },
    packageName: { type: "string", minLength: 1 },
    notes: { type: "array" },
  },
};

function extension(path: string): string {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/u);
  return match?.[0] ?? "";
}

export function createExportAssistantHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
}) {
  return async (input: AssistExportInput): Promise<AIWorkerResult<ExportAssistantOutput>> => {
    const agentResult = await dependencies.orchestrator.run<ExportAssistantOutput>({
      ...taskDefaults("EXPORT_ASSISTANT", input.taskId, input.workspaceId, input.exportJobId),
      subjectType: "EXPORT_JOB",
      data: {
        campaign: input.campaign,
        creative: input.creativeVersions,
        channel: input.channel,
        formatProfile: input.formatProfile,
        exportRecipe: input.exportRecipe,
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? exportSchema,
    });
    const output = assertCompleted(agentResult);
    const requiredExtension = String(
      input.exportRecipe.requiredExtension ?? input.exportRecipe.extension ?? "",
    ).toLowerCase();
    if (
      requiredExtension &&
      output.items.some((item) => extension(item.relativePath) !== requiredExtension)
    )
      throw new Error("EXPORT_EXTENSION_CHANGE_FORBIDDEN");
    const requiredFiles = Array.isArray(input.exportRecipe.requiredFiles)
      ? input.exportRecipe.requiredFiles.map(String)
      : [];
    const proposedPaths = new Set(output.items.map((item) => item.relativePath));
    if (requiredFiles.some((file) => !proposedPaths.has(file)))
      throw new Error("EXPORT_REQUIRED_FILE_MISSING");
    return { status: "COMPLETED", agentResult };
  };
}
