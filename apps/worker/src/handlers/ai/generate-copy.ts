import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface GenerateCopyInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly productId: string;
  readonly product: Readonly<Record<string, unknown>>;
  readonly brief: Readonly<Record<string, unknown>>;
  readonly brandProfile: Readonly<Record<string, unknown>>;
  readonly textSlots: readonly {
    readonly code: string;
    readonly maxUnits: number;
    readonly maxLines?: number | null;
  }[];
  readonly variantCount: number;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface CopyGenerationOutput {
  readonly variants: readonly {
    readonly variantId: string;
    readonly slots: Readonly<Record<string, string>>;
    readonly rationale: string;
    readonly riskFlags?: readonly string[];
  }[];
}
const copySchema: JsonSchema = {
  type: "object",
  required: ["variants"],
  additionalProperties: false,
  properties: { variants: { type: "array" } },
};

export function createCopyGeneratorHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
}) {
  return async (input: GenerateCopyInput): Promise<AIWorkerResult<CopyGenerationOutput>> => {
    const agentResult = await dependencies.orchestrator.run<CopyGenerationOutput>({
      ...taskDefaults("COPY_GENERATOR", input.taskId, input.workspaceId, input.campaignId),
      data: {
        brief: input.brief,
        product: input.product,
        brandProfile: input.brandProfile,
        textSlots: input.textSlots,
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? copySchema,
    });
    const output = assertCompleted(agentResult);
    const limits = new Map(input.textSlots.map((slot) => [slot.code, slot]));
    for (const variant of output.variants) {
      for (const [slotCode, value] of Object.entries(variant.slots)) {
        const limit = limits.get(slotCode);
        if (limit && value.length > limit.maxUnits)
          throw new Error(`COPY_SLOT_LIMIT_EXCEEDED:${slotCode}`);
      }
    }
    return { status: "COMPLETED", agentResult };
  };
}
