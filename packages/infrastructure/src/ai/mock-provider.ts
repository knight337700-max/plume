import type { AIExecutionRequest, AIExecutionResult, OpenAIProviderGateway } from "./openai-gateway.js";

const MOCK_OUTPUTS: Readonly<Record<string, unknown>> = Object.freeze({
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
    formatProfileId: "synthetic-format",
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

export function createDeterministicMockProviderGateway(): OpenAIProviderGateway {
  return {
    async execute(request: AIExecutionRequest): Promise<AIExecutionResult> {
      const outputJson = MOCK_OUTPUTS[request.metadata.agentCode] ?? {};
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
