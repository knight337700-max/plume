import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface PlanLayoutInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string;
  readonly channel: Readonly<Record<string, unknown>>;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly template: Readonly<Record<string, unknown>>;
  readonly assets: readonly Record<string, unknown>[];
  readonly copyVariant: Readonly<Record<string, unknown>>;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}
export interface LayoutPlanOutput {
  readonly formatProfileId: string;
  readonly templateId: string | null;
  readonly elements: readonly {
    readonly elementId: string;
    readonly elementType: string;
    readonly slotCode: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly zIndex: number;
    readonly assetVersionId?: string | null;
    readonly textValue?: string | null;
  }[];
  readonly usedAssetVersionIds: readonly string[];
  readonly copyAssets: Readonly<Record<string, string>>;
  readonly rationale: string;
  readonly riskFlags?: readonly string[];
}
const layoutSchema: JsonSchema = {
  type: "object",
  required: [
    "formatProfileId",
    "templateId",
    "elements",
    "usedAssetVersionIds",
    "copyAssets",
    "rationale",
  ],
  additionalProperties: false,
  properties: {
    formatProfileId: { type: "string" },
    templateId: { type: ["string", "null"] },
    elements: { type: "array" },
    usedAssetVersionIds: { type: "array", uniqueItems: true },
    copyAssets: { type: "object" },
    rationale: { type: "string", minLength: 1 },
    riskFlags: { type: "array" },
  },
};

export function createLayoutPlannerHandler(dependencies: {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
}) {
  return async (input: PlanLayoutInput): Promise<AIWorkerResult<LayoutPlanOutput>> => {
    const agentResult = await dependencies.orchestrator.run<LayoutPlanOutput>({
      ...taskDefaults("LAYOUT_PLANNER", input.taskId, input.workspaceId, input.creativeId),
      data: {
        channel: input.channel,
        formatProfile: input.formatProfile,
        template: input.template,
        assets: input.assets,
        copy: input.copyVariant,
      },
      messages: input.messages,
      outputSchema: dependencies.outputSchema ?? layoutSchema,
    });
    const output = assertCompleted(agentResult);
    const width = Number(input.formatProfile.width ?? input.formatProfile.canvasWidth ?? 0);
    const height = Number(input.formatProfile.height ?? input.formatProfile.canvasHeight ?? 0);
    const ids = new Set<string>();
    for (const element of output.elements) {
      if (ids.has(element.elementId))
        throw new Error(`LAYOUT_DUPLICATE_ELEMENT:${element.elementId}`);
      ids.add(element.elementId);
      if (
        element.width <= 0 ||
        element.height <= 0 ||
        element.x < 0 ||
        element.y < 0 ||
        (width > 0 && element.x + element.width > width) ||
        (height > 0 && element.y + element.height > height)
      )
        throw new Error(`LAYOUT_OUT_OF_BOUNDS:${element.elementId}`);
    }
    if (new Set(output.usedAssetVersionIds).size !== output.usedAssetVersionIds.length)
      throw new Error("LAYOUT_DUPLICATE_ASSET");
    return { status: "COMPLETED", agentResult };
  };
}
