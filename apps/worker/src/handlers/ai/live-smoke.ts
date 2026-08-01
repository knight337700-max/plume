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
import type {
  AiLiveSmokePayload,
  AiLiveSmokeVerificationPayload,
} from "../../../../../packages/contracts/src/async.js";
import type {
  LiveSmokeBudgetStore,
  LiveSmokeProviderMode,
} from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";

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
  readonly budgetEpochId: string;
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
  options: { readonly providerMode?: LiveSmokeProviderMode } = {},
): LiveSmokeRuntimeHandler {
  const providerMode = options.providerMode ?? "live";
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    const payload = job.data as AiLiveSmokePayload & { readonly workspaceId?: string };
    if (!isAgentCode(payload.agentCode)) throw new Error("AI_LIVE_SMOKE_AGENT_NOT_REGISTERED");
    const workspaceId =
      invocation?.workspaceId ?? payload.workspaceId ?? "00000000-0000-4000-8000-0000000002c0";
    const smokeRunId =
      invocation?.smokeRunId ?? payload.smokeRunId ?? String(job.id ?? workspaceId);
    const budgetEpochId = invocation?.budgetEpochId ?? payload.budgetEpochId;
    if (!budgetEpochId) throw budgetError("LIVE_SMOKE_BUDGET_EPOCH_REQUIRED");
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
      `${budgetEpochId}:${jobItemId}:delivery:${deliveryAttempt}:${kind}`;
    const orchestrator = createAgentOrchestrator({
      gateway,
      beforeProviderCall: async (kind) => {
        if (providerMode === "mock") return;
        const reservation = await budgetStore.reserve({
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey: reservationKey(kind),
          providerMode,
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

/**
 * Verification-only shadow calls are intentionally separate from the original
 * workflow. The durable item receives only redacted coverage facts.
 */
export function createLiveSmokeVerificationHandler(
  gateway: AgentProviderGateway,
  budgetStore: LiveSmokeBudgetStore,
  coverageStore: LiveSmokeCoverageStore,
  options: { readonly providerMode: LiveSmokeProviderMode },
): LiveSmokeRuntimeHandler {
  const liveSmoke = createLiveSmokeHandler(gateway, budgetStore, { providerMode: "live" });
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    if (options.providerMode !== "live") {
      throw Object.assign(new Error("LIVE_SMOKE_VERIFICATION_REQUIRES_LIVE"), {
        code: "LIVE_SMOKE_VERIFICATION_REQUIRES_LIVE",
        retryable: false as const,
      });
    }
    const payload = job.data as AiLiveSmokeVerificationPayload;
    if (payload.verificationOnly !== true) throw new Error("LIVE_SMOKE_VERIFICATION_FLAG_REQUIRED");
    const result = (await liveSmoke(job, invocation)) as {
      readonly status: string;
      readonly agentCode: string;
      readonly metadata?: {
        readonly model?: string;
        readonly providerRequestId?: string;
        readonly usage?: { readonly inputUnits?: number; readonly outputUnits?: number };
      };
    };
    if (result.status !== "COMPLETED") throw new Error("LIVE_SMOKE_VERIFICATION_RESULT_INCOMPLETE");
    if (result.metadata?.model !== "gpt-5.6-luna")
      throw new Error("LIVE_SMOKE_VERIFICATION_MODEL_MISMATCH");
    const workspaceId = invocation?.workspaceId ?? payload.workspaceId;
    const smokeRunId = invocation?.smokeRunId ?? payload.smokeRunId;
    const budgetEpochId = invocation?.budgetEpochId ?? payload.budgetEpochId;
    const jobItemId = invocation?.jobItemId ?? String(job.id ?? payload.agentCode);
    await coverageStore.recordCoverage({
      verificationRunId: payload.verificationRunId,
      workspaceId,
      smokeRunId,
      budgetEpochId,
      parentWorkflowJobId: payload.parentWorkflowJobId,
      agentCode: result.agentCode,
      provider: "OpenAI",
      model: result.metadata.model,
      providerRequestSent: true,
      structuredOutputPassed: true,
      domainValidationPassed: true,
      ...(result.metadata.providerRequestId
        ? { providerRequestId: result.metadata.providerRequestId }
        : {}),
      ...(result.metadata.usage?.inputUnits === undefined
        ? {}
        : { inputUnits: result.metadata.usage.inputUnits }),
      ...(result.metadata.usage?.outputUnits === undefined
        ? {}
        : { outputUnits: result.metadata.usage.outputUnits }),
    });
    return {
      status: "COMPLETED",
      verificationRunId: payload.verificationRunId,
      agentCode: result.agentCode,
      jobItemId,
      provider: "OpenAI",
      model: result.metadata.model,
      providerRequestSent: true,
      structuredOutputPassed: true,
      domainValidationPassed: true,
    };
  };
}
