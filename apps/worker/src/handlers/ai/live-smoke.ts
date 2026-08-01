import type { Job } from "bullmq";
import { agentSchemas } from "../../../../../packages/contracts/src/agent-schemas/index.js";
import {
  AGENT_CODES,
  promptRegistry,
  type AgentCode,
} from "../../../../../packages/core/src/agents/prompt-registry.js";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
  type ProviderCallKind,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import type { AiLiveSmokePayload } from "../../../../../packages/contracts/src/async.js";
import type { LiveSmokeBudgetStore } from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";

const SYNTHETIC_IDS = Object.freeze({
  campaign: "00000000-0000-4000-8000-0000000002c1",
  product: "00000000-0000-4000-8000-0000000002c2",
  format: "00000000-0000-4000-8000-0000000002c3",
  asset: "00000000-0000-4000-8000-0000000002c4",
  creative: "00000000-0000-4000-8000-0000000002c5",
});

const SYNTHETIC_DATA: Readonly<Record<string, unknown>> = Object.freeze({
  sourceIds: ["00000000-0000-4000-8000-0000000002c6"],
  sourceText: "Synthetic JACOMO Autumn Sofa Preview brief for staging validation.",
  citations: [],
  brandProfile: { brand: "JACOMO", market: "KR", synthetic: true },
  productNames: ["Synthetic Autumn Sofa"],
  candidates: [],
  products: [{ id: SYNTHETIC_IDS.product, name: "Synthetic Autumn Sofa" }],
  product: { id: SYNTHETIC_IDS.product, name: "Synthetic Autumn Sofa" },
  formatProfile: { id: SYNTHETIC_IDS.format, width: 1200, height: 628 },
  brief: {
    campaign: "Synthetic Autumn Sofa Preview",
    objective: "Generate validation-safe staging planning metadata",
  },
  assets: [],
  template: { id: "synthetic-template", safeZone: true },
  safeZones: [],
  copy: { headline: "Synthetic autumn comfort" },
  creativeDocument: { schemaVersion: "1.0.0", metadata: { campaignId: SYNTHETIC_IDS.campaign } },
  editRequest: "Move the synthetic headline slightly lower.",
  validation: [],
  render: { mimeType: "image/png", synthetic: true },
  rules: [],
  landingSnapshot: null,
  campaign: { id: SYNTHETIC_IDS.campaign, name: "Synthetic Autumn Sofa Preview" },
  creative: { id: SYNTHETIC_IDS.creative, synthetic: true },
  exportRecipe: { id: "synthetic-export", packageType: "ZIP" },
});

const SYNTHETIC_MESSAGES = Object.freeze([
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
]);

function isAgentCode(value: string): value is AgentCode {
  return (AGENT_CODES as readonly string[]).includes(value);
}

export interface LiveSmokeInvocationContext {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly jobItemId: string;
}

export type LiveSmokeRuntimeHandler = (
  job: Job<unknown>,
  invocation?: LiveSmokeInvocationContext,
) => Promise<unknown>;

function budgetError(message: string): Error & { readonly retryable: false } {
  return Object.assign(new Error(message), { code: message, retryable: false as const });
}

export function createLiveSmokeHandler(
  gateway: AgentProviderGateway,
  budgetStore: LiveSmokeBudgetStore,
): LiveSmokeRuntimeHandler {
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    const payload = job.data as AiLiveSmokePayload & { readonly workspaceId?: string };
    if (!isAgentCode(payload.agentCode)) throw new Error("AI_LIVE_SMOKE_AGENT_NOT_REGISTERED");
    const workspaceId =
      invocation?.workspaceId ?? payload.workspaceId ?? "00000000-0000-4000-8000-0000000002c0";
    const smokeRunId =
      invocation?.smokeRunId ?? payload.smokeRunId ?? String(job.id ?? workspaceId);
    const jobItemId = invocation?.jobItemId ?? String(job.id ?? `${payload.agentCode}-live-smoke`);
    const prompt = promptRegistry.resolve(payload.agentCode);
    const schema = (agentSchemas as Readonly<Record<string, unknown>>)[prompt.outputSchemaId];
    if (!schema) throw new Error(`AI_LIVE_SMOKE_SCHEMA_NOT_FOUND:${prompt.outputSchemaId}`);
    const workflowCallBudget =
      Number.isInteger(payload.workflowCallBudget) && payload.workflowCallBudget! > 0
        ? payload.workflowCallBudget!
        : Number.isInteger(payload.requestBudget) && payload.requestBudget! > 0
          ? payload.requestBudget!
          : 20;
    if (workflowCallBudget > 20) throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_INVALID");
    const deliveryAttempt =
      Number.isInteger(job.attemptsMade) && job.attemptsMade >= 0 ? job.attemptsMade : 0;
    const reservationKey = (kind: ProviderCallKind): string =>
      `${jobItemId}:delivery:${deliveryAttempt}:${kind}`;
    const orchestrator = createAgentOrchestrator({
      gateway,
      beforeProviderCall: async (kind) => {
        const reservation = await budgetStore.reserve({
          workspaceId,
          smokeRunId,
          reservationKey: reservationKey(kind),
          units: 1,
          limit: workflowCallBudget,
        });
        if (!reservation.allowed) throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_REACHED");
        if (reservation.duplicate) throw budgetError("LIVE_SMOKE_DUPLICATE_PROVIDER_CALL_BLOCKED");
      },
    });
    const result = await orchestrator.run({
      taskId: String(job.id ?? `${payload.agentCode}-live-smoke`),
      agentCode: payload.agentCode,
      correlationId: String(job.id ?? `${payload.agentCode}-live-smoke`),
      workspaceId,
      subjectType: "CAMPAIGN",
      subjectId: SYNTHETIC_IDS.campaign,
      locale: "ko-KR",
      data: SYNTHETIC_DATA,
      messages: SYNTHETIC_MESSAGES,
      outputSchema: schema as unknown as JsonSchema,
      timeoutSeconds: 60,
    });
    if (result.status !== "COMPLETED")
      throw new Error(
        `AI_LIVE_SMOKE_AGENT_FAILED:${payload.agentCode}:${result.errorCode ?? "UNKNOWN"}`,
      );
    return {
      status: result.status,
      agentCode: result.agentCode,
      metadata: result.metadata,
      output: result.output,
    };
  };
}
