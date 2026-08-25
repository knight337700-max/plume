import { createHash } from "node:crypto";
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
import { DEFAULT_LLM_MODEL } from "../../../packages/core/src/ai-model.js";
import {
  LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
  resolveLiveSmokeSyntheticScenario,
} from "../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000002c0";
const MAX_REQUESTS = Number(process.env.LIVE_SMOKE_REQUEST_CAP?.trim() || "13");

function stableSmokeRunId(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function stableBudgetEpochId(idempotencyKey: string): string {
  return stableSmokeRunId(`${idempotencyKey}:budget-epoch`);
}

function schemaFor(agentCode: AgentCode) {
  const prompt = promptRegistry.resolve(agentCode);
  const schema = (agentSchemas as Readonly<Record<string, unknown>>)[prompt.outputSchemaId];
  if (!schema) throw new Error(`LIVE_SMOKE_SCHEMA_NOT_FOUND:${prompt.outputSchemaId}`);
  return schema;
}

function requestFor(
  agentCode: AgentCode,
  taskId: string,
  scenario: ReturnType<typeof resolveLiveSmokeSyntheticScenario>,
) {
  return {
    taskId,
    agentCode,
    workspaceId: WORKSPACE_ID,
    correlationId: taskId,
    subjectType: "CAMPAIGN",
    subjectId: (scenario.agentData.campaign as { readonly id: string }).id,
    locale: scenario.locale,
    data: scenario.agentData,
    messages: scenario.messages,
    outputSchema: schemaFor(agentCode),
    timeoutSeconds: 60,
    syntheticScenarioId: scenario.id,
    channelCode: scenario.channel.code,
    formatProfileId: scenario.formatProfile.id as string,
    profileVersion: scenario.formatProfile.version as string,
    synthetic: true,
  };
}

function isConnectivitySuccess(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const output = value as Readonly<Record<string, unknown>>;
  return output.status === "ok" && output.environment === "staging" && output.provider === "openai";
}

async function main(): Promise<void> {
  const scenario = resolveLiveSmokeSyntheticScenario(LIVE_SMOKE_SYNTHETIC_SCENARIO_ID);
  if (!Number.isInteger(MAX_REQUESTS) || MAX_REQUESTS < 1 || MAX_REQUESTS > 13)
    throw new Error("LIVE_SMOKE_REQUEST_CAP_INVALID");
  if ((process.env.OPENAI_MODEL?.trim() || DEFAULT_LLM_MODEL) !== DEFAULT_LLM_MODEL)
    throw new Error("LIVE_SMOKE_MODEL_MISMATCH");
  const provider = createOpenAIProviderRuntime();
  if (provider.mode === "live") throw new Error("LIVE_SMOKE_DURABLE_LEDGER_REQUIRED");
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
    messages: scenario.canaryMessages,
    outputSchema: {
      type: "object",
      required: ["status", "environment", "provider"],
      additionalProperties: false,
      properties: {
        status: { enum: ["ok"] },
        environment: { enum: ["staging"] },
        provider: { enum: ["openai"] },
      },
    },
    imageInputs: [],
    timeoutSeconds: 60,
    metadata: {
      workspaceId: WORKSPACE_ID,
      agentCode: "CONNECTIVITY_TEST",
      promptVersion: "1.0.0",
      correlationId: "gate-h-2c-connectivity",
      syntheticScenarioId: scenario.id,
      channelCode: scenario.channel.code,
      formatProfileId: scenario.formatProfile.id as string,
      profileVersion: scenario.formatProfile.version as string,
      synthetic: true,
    },
  });
  liveRequests += 1;
  usage.push({
    inputUnits: connectivity.usage?.inputUnits ?? 0,
    outputUnits: connectivity.usage?.outputUnits ?? 0,
    latencyMs: connectivity.latencyMs,
  });
  if (connectivity.status !== "COMPLETED" || !isConnectivitySuccess(connectivity.outputJson))
    throw new Error("LIVE_SMOKE_CONNECTIVITY_FAILED");

  const directResults: Array<Record<string, unknown>> = [];
  for (const agentCode of AGENT_CODES) {
    const result = await orchestrator.run(
      requestFor(agentCode, `gate-h-2c-direct-${agentCode}`, scenario),
    );
    if (result.status !== "COMPLETED") throw new Error(`LIVE_SMOKE_AGENT_FAILED:${agentCode}`);
    directResults.push({
      agentCode,
      status: result.status,
      model: result.metadata.model ?? DEFAULT_LLM_MODEL,
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
  const smokeRunId = stableSmokeRunId(idempotencyKey);
  const budgetEpochId = stableBudgetEpochId(idempotencyKey);
  const root = await publisher.enqueue({
    workspaceId: WORKSPACE_ID,
    command: "ai.live_smoke",
    schemaVersion: 1,
    idempotencyKey,
    payload: {
      agentCode: AGENT_CODES[0],
      budgetEpochId,
      smokeRunId,
      workflowCallBudget: requestBudget,
      workspaceId: WORKSPACE_ID,
      syntheticScenarioId: scenario.id,
    },
    requestedBy: WORKSPACE_ID,
  });
  for (const agentCode of AGENT_CODES.slice(1))
    await publisher.enqueue({
      workspaceId: WORKSPACE_ID,
      command: "ai.live_smoke",
      schemaVersion: 1,
      jobId: root.jobId,
      causationId: root.messageId,
      payload: {
        agentCode,
        budgetEpochId,
        smokeRunId,
        workflowCallBudget: requestBudget,
        workspaceId: WORKSPACE_ID,
        syntheticScenarioId: scenario.id,
      },
      requestedBy: WORKSPACE_ID,
    });
  const replay = await publisher.enqueue({
    workspaceId: WORKSPACE_ID,
    command: "ai.live_smoke",
    schemaVersion: 1,
    idempotencyKey,
    payload: {
      agentCode: AGENT_CODES[0],
      budgetEpochId,
      smokeRunId,
      workflowCallBudget: requestBudget,
      workspaceId: WORKSPACE_ID,
      syntheticScenarioId: scenario.id,
    },
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
      model: DEFAULT_LLM_MODEL,
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
