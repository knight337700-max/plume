// eslint-disable-next-line no-restricted-imports -- contracts lint source runs against the workspace core source.
import {
  AGENT_CODES,
  createStrictOutputAdapter,
  type AgentCode,
  type JsonSchema,
  type StrictOutputAdapter,
} from "../../core/src/public.js";
import { agentSchemas } from "./agent-schemas/index.js";

const AGENT_SCHEMA_IDS: Readonly<Record<AgentCode, string>> = Object.freeze({
  CAMPAIGN_ANALYST: "campaign-analysis-result.schema.json",
  PRODUCT_MATCHER: "product-match-result.schema.json",
  ASSET_CURATOR: "asset-recommendation-result.schema.json",
  COPY_GENERATOR: "copy-generation-result.schema.json",
  LAYOUT_PLANNER: "layout-plan.schema.json",
  NATURAL_LANGUAGE_EDITOR: "edit-operation-batch.schema.json",
  AI_POLICY_REVIEWER: "ai-validation-result.schema.json",
  EXPORT_ASSISTANT: "export-assistant-result.schema.json",
});

export interface StrictSchemaLintIssue {
  readonly path: string;
  readonly rule: string;
  readonly message: string;
}

export interface StrictSchemaLintResult {
  readonly agentCode: AgentCode;
  readonly schemaId: string;
  readonly adapter: StrictOutputAdapter;
  readonly issues: readonly StrictSchemaLintIssue[];
  readonly maximumNestingDepth: number;
}

function asSchema(value: unknown): JsonSchema {
  return value as JsonSchema;
}

function walk(
  schema: JsonSchema,
  path: string,
  depth: number,
  issues: StrictSchemaLintIssue[],
): number {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  let maximumDepth = depth;
  if (path === "$" && (schema.anyOf || !types.includes("object")))
    issues.push({ path, rule: "root_object", message: "root must be a strict object" });
  if (schema.anyOf && path === "$")
    issues.push({ path, rule: "no_root_anyOf", message: "root anyOf is not allowed" });
  if (types.includes("object")) {
    if (schema.additionalProperties !== false)
      issues.push({
        path,
        rule: "additionalProperties_false",
        message: "every transport object must disable additionalProperties",
      });
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    for (const key of Object.keys(properties))
      if (!required.has(key))
        issues.push({
          path: `${path}.${key}`,
          rule: "required_properties",
          message: "every declared property must be required",
        });
    for (const [key, child] of Object.entries(properties))
      maximumDepth = Math.max(maximumDepth, walk(child, `${path}.${key}`, depth + 1, issues));
  }
  if (types.includes("array") && schema.items)
    maximumDepth = Math.max(maximumDepth, walk(schema.items, `${path}[]`, depth + 1, issues));
  if (schema.anyOf && path !== "$")
    for (const [index, child] of schema.anyOf.entries())
      maximumDepth = Math.max(
        maximumDepth,
        walk(child, `${path}.anyOf[${index}]`, depth + 1, issues),
      );
  return maximumDepth;
}

export function createStrictAgentAdapters(): readonly {
  readonly agentCode: AgentCode;
  readonly schemaId: string;
  readonly adapter: StrictOutputAdapter;
}[] {
  return Object.freeze(
    AGENT_CODES.map((agentCode) => {
      const schemaId = AGENT_SCHEMA_IDS[agentCode];
      const domainSchema = asSchema((agentSchemas as Readonly<Record<string, unknown>>)[schemaId]);
      if (!domainSchema) throw new Error(`AGENT_SCHEMA_NOT_FOUND:${schemaId}`);
      return Object.freeze({
        agentCode,
        schemaId,
        adapter: createStrictOutputAdapter({ schemaId, domainSchema }),
      });
    }),
  );
}

export function lintStrictAgentSchemas(): readonly StrictSchemaLintResult[] {
  return Object.freeze(
    createStrictAgentAdapters().map(({ agentCode, schemaId, adapter }) => {
      const issues: StrictSchemaLintIssue[] = [];
      const maximumNestingDepth = walk(adapter.transportSchema, "$", 0, issues);
      if (maximumNestingDepth > 12)
        issues.push({
          path: "$",
          rule: "maximum_nesting_depth",
          message: `maximum nesting depth ${maximumNestingDepth} exceeds 12`,
        });
      return Object.freeze({
        agentCode,
        schemaId,
        adapter,
        issues: Object.freeze(issues),
        maximumNestingDepth,
      });
    }),
  );
}
