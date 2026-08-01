import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../packages/core/src/agents/orchestrator.js";
import {
  AGENT_CODES,
  promptRegistry,
  type AgentCode,
} from "../../../packages/core/src/agents/prompt-registry.js";
import { agentSchemas } from "../../../packages/contracts/src/agent-schemas/index.js";
import { createDatabaseClient } from "../../../packages/db/src/client.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { DurableWorkflowRepository } from "../../../packages/infrastructure/src/async/durable-workflow-repository.js";
import { createOpenAIProviderRuntime } from "../../../packages/infrastructure/src/ai/provider-runtime.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000002c0";
const CAMPAIGN_ID = "00000000-0000-4000-8000-0000000002c1";
const MAX_REQUESTS = 20;

const syntheticData: Readonly<Record<string, unknown>> = {
  sourceIds: ["00000000-0000-4000-8000-0000000002c6"],
  sourceText: "Synthetic JACOMO Autumn Sofa Preview brief for staging validation.",
  citations: [],
  brandProfile: { brand: "JACOMO", market: "KR", synthetic: true },
  productNames: ["Synthetic Autumn Sofa"],
  candidates: [],
  products: [{ id: "00000000-0000-4000-8000-0000000002c2", name: "Synthetic Autumn Sofa" }],
  product: { id: "00000000-0000-4000-8000-0000000002c2", name: "Synthetic Autumn Sofa" },
  formatProfile: { id: "00000000-0000-4000-8000-0000000002c3", width: 1200, height: 628 },
  brief: {
    campaign: "Synthetic Autumn Sofa Preview",
    objective: "Generate validation-safe staging planning metadata",
  },
  assets: [],
  template: { id: "synthetic-template", safeZone: true },
  safeZones: [],
  copy: { headline: "Synthetic autumn comfort" },
  creativeDocument: { schemaVersion: "1.0.0" },
  editRequest: "Move the synthetic headline slightly lower.",
  validation: [],
  render: { mimeType: "image/png", synthetic: true },
  rules: [],
  landingSnapshot: null,
  campaign: { id: CAMPAIGN_ID, name: "Synthetic Autumn Sofa Preview" },
  creative: { id: "00000000-0000-4000-8000-0000000002c5", synthetic: true },
  exportRecipe: { id: "synthetic-export", packageType: "ZIP" },
};

const messages = [
  {
    role: "system" as const,
    content:
      "Staging-only synthetic evaluation. Return only the registered JSON schema. Do not use tools or external data.",
  },
  {
    role: "user" as const,
    content:
      "Evaluate the synthetic JACOMO Autumn Sofa Preview brief for a KR Naver GFA planning workflow. Customer data, images, and external URLs are absent.",
  },
];

function schemaFor(agentCode: AgentCode) {
  const prompt = promptRegistry.resolve(agentCode);
  const schema = (agentSchemas as Readonly<Record<string, unknown>>)[prompt.outputSchemaId];
  if (!schema) throw new Error(`LIVE_SMOKE_SCHEMA_NOT_FOUND:${prompt.outputSchemaId}`);
  return schema;
}

function requestFor(agentCode: AgentCode, taskId: string) {
  return {
    taskId,
    agentCode,
    workspaceId: WORKSPACE_ID,
    correlationId: taskId,
    subjectType: "CAMPAIGN",
    subjectId: CAMPAIGN_ID,
    locale: "ko-KR",
    data: syntheticData,
    messages,
    outputSchema: schemaFor(agentCode),
    timeoutSeconds: 60,
  };
}

async function main(): Promise<void> {
  const provider = createOpenAIProviderRuntime();
  let liveRequests = 0;
  const usage: Array<{ inputUnits: number; outputUnits: number; latencyMs: number }> = [];
  const countedGateway: AgentProviderGateway = {
    async execute(request) {
      if (liveRequests >= MAX_REQUESTS) throw new Error("LIVE_SMOKE_REQUEST_CAP_REACHED");
      liveRequests += 1;
      const result = await provider.gateway.execute(request);
      usage.push({
        inputUnits: result.usage?.inputUnits ?? 0,
        outputUnits: result.usage?.outputUnits ?? 0,
        latencyMs: result.latencyMs,
      });
      return result;
    },
  };
  const orchestrator = createAgentOrchestrator({ gateway: countedGateway });

  const connectivity = await provider.gateway.execute({
    taskId: "gate-h-2c-connectivity",
    modelPolicyId: "balanced-structured-v1",
    messages: [
      { role: "user", content: "Return status=ok, environment=staging, provider=openai as JSON." },
    ],
    outputSchema: {
      type: "object",
      required: ["status", "environment", "provider"],
      additionalProperties: false,
      properties: {
        status: { const: "ok" },
        environment: { const: "staging" },
        provider: { const: "openai" },
      },
    },
    imageInputs: [],
    timeoutSeconds: 60,
    metadata: {
      workspaceId: WORKSPACE_ID,
      agentCode: "CONNECTIVITY_TEST",
      promptVersion: "1.0.0",
      correlationId: "gate-h-2c-connectivity",
    },
  });
  liveRequests += 1;
  usage.push({
    inputUnits: connectivity.usage?.inputUnits ?? 0,
    outputUnits: connectivity.usage?.outputUnits ?? 0,
    latencyMs: connectivity.latencyMs,
  });
  if (
    connectivity.status !== "COMPLETED" ||
    JSON.stringify(connectivity.outputJson) !==
      JSON.stringify({ status: "ok", environment: "staging", provider: "openai" })
  )
    throw new Error("LIVE_SMOKE_CONNECTIVITY_FAILED");

  const directResults: Array<Record<string, unknown>> = [];
  for (const agentCode of AGENT_CODES) {
    const result = await orchestrator.run(requestFor(agentCode, `gate-h-2c-direct-${agentCode}`));
    if (result.status !== "COMPLETED") throw new Error(`LIVE_SMOKE_AGENT_FAILED:${agentCode}`);
    directResults.push({
      agentCode,
      status: result.status,
      attempt: result.metadata.attempt,
      latencyMs: result.metadata.latencyMs,
      usage: result.metadata.usage ?? null,
    });
  }

  const { sql } = createDatabaseClient();
  const publisher = new DurableAsyncCommandPublisher(sql);
  const workflow = new DurableWorkflowRepository(sql);
  const idempotencyKey = "gate-h-2c-live-workflow-synthetic-20260801";
  if (liveRequests + AGENT_CODES.length > MAX_REQUESTS)
    throw new Error("LIVE_SMOKE_QUEUE_BUDGET_UNAVAILABLE");
  const requestBudget = MAX_REQUESTS - liveRequests;
  const root = await publisher.enqueue({
    workspaceId: WORKSPACE_ID,
    command: "ai.live_smoke",
    schemaVersion: 1,
    idempotencyKey,
    payload: { agentCode: AGENT_CODES[0], requestBudget, workspaceId: WORKSPACE_ID },
    requestedBy: WORKSPACE_ID,
  });
  for (const agentCode of AGENT_CODES.slice(1))
    await publisher.enqueue({
      workspaceId: WORKSPACE_ID,
      command: "ai.live_smoke",
      schemaVersion: 1,
      jobId: root.jobId,
      causationId: root.messageId,
      payload: { agentCode, requestBudget, workspaceId: WORKSPACE_ID },
      requestedBy: WORKSPACE_ID,
    });
  const replay = await publisher.enqueue({
    workspaceId: WORKSPACE_ID,
    command: "ai.live_smoke",
    schemaVersion: 1,
    idempotencyKey,
    payload: { agentCode: AGENT_CODES[0], requestBudget, workspaceId: WORKSPACE_ID },
    requestedBy: WORKSPACE_ID,
  });
  if (replay.jobId !== root.jobId) throw new Error("LIVE_SMOKE_IDEMPOTENCY_FAILED");

  const deadline = Date.now() + 120_000;
  let items = await workflow.listItems(WORKSPACE_ID, root.jobId);
  while (Date.now() < deadline && !items.every((item) => item.status === "COMPLETED")) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    items = await workflow.listItems(WORKSPACE_ID, root.jobId);
    if (items.some((item) => item.status === "FAILED"))
      throw new Error("LIVE_SMOKE_QUEUE_WORKFLOW_FAILED");
  }
  if (items.length !== AGENT_CODES.length || !items.every((item) => item.status === "COMPLETED"))
    throw new Error("LIVE_SMOKE_QUEUE_WORKFLOW_TIMEOUT");
  await sql.end({ timeout: 5 });

  const latencies = usage.map((entry) => entry.latencyMs).sort((left, right) => left - right);
  const totalInput = usage.reduce((sum, entry) => sum + entry.inputUnits, 0);
  const totalOutput = usage.reduce((sum, entry) => sum + entry.outputUnits, 0);
  const queueRequests = items.reduce(
    (sum, item) =>
      sum +
      Number(
        (item.result as { metadata?: { attempt?: number } } | undefined)?.metadata?.attempt ?? 0,
      ),
    0,
  );
  for (const item of items) {
    const metadata = (
      item.result as
        | {
            metadata?: {
              usage?: { inputUnits?: number; outputUnits?: number };
              latencyMs?: number;
            };
          }
        | undefined
    )?.metadata;
    if (metadata)
      usage.push({
        inputUnits: metadata.usage?.inputUnits ?? 0,
        outputUnits: metadata.usage?.outputUnits ?? 0,
        latencyMs: metadata.latencyMs ?? 0,
      });
  }
  liveRequests += queueRequests;
  if (liveRequests > MAX_REQUESTS) throw new Error("LIVE_SMOKE_REQUEST_CAP_REACHED");
  console.log(
    JSON.stringify({
      status: "PASS",
      connectivity: { structuredOutput: true, store: false, background: false },
      agents: directResults.length,
      queueItems: items.length,
      liveRequests,
      totalInput,
      totalOutput,
      p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
      p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
      idempotency: "PASS",
      repair: "NOT_SUPPORTED",
      retry: "NOT_SUPPORTED",
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "LIVE_SMOKE_FAILED");
  process.exitCode = 1;
});
