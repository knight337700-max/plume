import type {
  AIExecutionRequest,
  AIExecutionResult,
  OpenAIProviderGateway,
} from "./openai-gateway.js";

const MOCK_OUTPUTS: Readonly<Record<string, unknown>> = Object.freeze({
  CONNECTIVITY_TEST: { status: "ok", environment: "staging", provider: "openai" },
  CAMPAIGN_ANALYST: {
    objective: "synthetic Jacomo campaign analysis",
    targets: ["synthetic audience"],
    benefits: ["synthetic benefit"],
    brandMessage: null,
    campaignMessages: ["synthetic campaign message"],
    products: [],
    forbiddenExpressions: [],
    citations: [],
    confidence: 1,
  },
  PRODUCT_MATCHER: { matches: [] },
  ASSET_CURATOR: { productId: "synthetic-product", rankedAssets: [] },
  COPY_GENERATOR: { variants: [] },
  LAYOUT_PLANNER: {
    templateId: null,
    elements: [],
    usedAssetVersionIds: [],
    copyAssets: {},
    rationale: "synthetic layout plan",
  },
  NATURAL_LANGUAGE_EDITOR: {
    operations: [],
    summary: "synthetic edit plan",
    requiresAssetSelection: false,
    requiresUserConfirmation: false,
  },
  AI_POLICY_REVIEWER: { results: [] },
  EXPORT_ASSISTANT: { items: [], packageName: "synthetic-export", notes: [] },
});

type MockSchemaNode = {
  readonly type?: string | readonly string[];
  readonly anyOf?: readonly MockSchemaNode[];
  readonly properties?: Readonly<Record<string, MockSchemaNode>>;
};

function schemaAllowsNull(schema: MockSchemaNode): boolean {
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    return true;
  }
  return schema.anyOf?.some((variant) => schemaAllowsNull(variant)) ?? false;
}

function materializeNullableProperties(output: unknown, schema: MockSchemaNode): unknown {
  if (
    output === null ||
    typeof output !== "object" ||
    Array.isArray(output) ||
    !schema.properties
  ) {
    return output;
  }

  const materialized = { ...(output as Record<string, unknown>) };
  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    if (!(propertyName in materialized) && schemaAllowsNull(propertySchema)) {
      materialized[propertyName] = null;
    }
  }
  return materialized;
}

export function createDeterministicMockProviderGateway(): OpenAIProviderGateway {
  return {
    async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
      const baseOutput = MOCK_OUTPUTS[request.metadata.agentCode] ?? {};
      const outputSchema = request.outputSchema as MockSchemaNode;
      const layoutSchema = outputSchema.properties?.copyAssets;
      const layoutOutput =
        request.metadata.agentCode === "LAYOUT_PLANNER" &&
        layoutSchema &&
        (layoutSchema.type === "array" ||
          (Array.isArray(layoutSchema.type) && layoutSchema.type.includes("array")))
          ? { ...((baseOutput as Record<string, unknown>) ?? {}), copyAssets: [] }
          : baseOutput;
      const outputJson = materializeNullableProperties(layoutOutput, outputSchema);
      return {
        provider: "OpenAI",
        model: "mock-jacomo-1",
        status: "COMPLETED",
        outputJson,
        usage: { inputUnits: 0, outputUnits: 0 },
        latencyMs: 0,
        finishReason: "mock",
        providerRequestId: `mock-${request.taskId}`,
      };
    },
  };
}
