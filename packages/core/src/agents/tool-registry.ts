import type { AgentCode } from "./prompt-registry.js";

export type ToolAccess = "READ";

export interface AgentToolDefinition {
  readonly code: string;
  readonly allowedAgents: readonly AgentCode[];
  readonly access: ToolAccess;
  readonly workspaceScoped: true;
  readonly writeAccess: false;
  readonly networkAccess: false;
  readonly maxResponseBytes: number;
}

const definitions: readonly [string, readonly AgentCode[]][] = [
  ["campaign_source_reader", ["CAMPAIGN_ANALYST"]],
  ["brand_profile_reader", ["CAMPAIGN_ANALYST", "COPY_GENERATOR"]],
  ["product_search", ["PRODUCT_MATCHER"]],
  ["product_detail_reader", ["PRODUCT_MATCHER", "COPY_GENERATOR", "AI_POLICY_REVIEWER"]],
  ["asset_search", ["ASSET_CURATOR"]],
  ["asset_analysis_reader", ["ASSET_CURATOR"]],
  ["format_profile_reader", ["ASSET_CURATOR", "LAYOUT_PLANNER"]],
  ["brief_reader", ["COPY_GENERATOR", "AI_POLICY_REVIEWER"]],
  ["text_slot_reader", ["COPY_GENERATOR"]],
  ["template_reader", ["LAYOUT_PLANNER"]],
  ["asset_reader", ["LAYOUT_PLANNER", "NATURAL_LANGUAGE_EDITOR"]],
  ["safe_zone_reader", ["LAYOUT_PLANNER"]],
  ["creative_document_reader", ["NATURAL_LANGUAGE_EDITOR"]],
  ["validation_result_reader", ["NATURAL_LANGUAGE_EDITOR"]],
  ["creative_render_reader", ["AI_POLICY_REVIEWER"]],
  ["landing_snapshot_reader", ["AI_POLICY_REVIEWER"]],
  ["export_recipe_reader", ["EXPORT_ASSISTANT"]],
  ["campaign_reader", ["EXPORT_ASSISTANT"]],
  ["creative_version_reader", ["EXPORT_ASSISTANT"]],
];

export const agentToolDefinitions: readonly AgentToolDefinition[] = Object.freeze(
  definitions.map(([code, allowedAgents]) =>
    Object.freeze({
      code,
      allowedAgents: Object.freeze([...allowedAgents]),
      access: "READ" as const,
      workspaceScoped: true as const,
      writeAccess: false as const,
      networkAccess: false as const,
      maxResponseBytes: 32_768,
    }),
  ),
);

export function createToolRegistry(definitionsInput = agentToolDefinitions) {
  const byCode = new Map(definitionsInput.map((definition) => [definition.code, definition]));
  return {
    resolve(code: string): AgentToolDefinition {
      const definition = byCode.get(code);
      if (!definition) throw new Error(`Unknown agent tool: ${code}`);
      return definition;
    },
    list(): readonly AgentToolDefinition[] {
      return definitionsInput;
    },
    canUse(agentCode: AgentCode, code: string): boolean {
      return this.resolve(code).allowedAgents.includes(agentCode);
    },
  };
}

export const toolRegistry = createToolRegistry();
