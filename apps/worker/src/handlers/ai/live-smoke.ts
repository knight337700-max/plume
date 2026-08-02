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
  AiLiveSmokeCanaryPayload,
  AiLiveSmokePayload,
  AiLiveSmokeVerificationPayload,
} from "../../../../../packages/contracts/src/async.js";
import type {
  LiveSmokeBudgetStore,
  LiveSmokeProviderMode,
} from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import type {
  LiveSmokeLifecycleStore,
  LiveSmokeReservationLifecycleInput,
} from "../../../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";

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

function lifecycleInput(
  base: Omit<
    LiveSmokeReservationLifecycleInput,
    "lifecycleState" | "providerRequestSent" | "providerResponseReceived" | "billableRequestCount"
  >,
  lifecycleState: LiveSmokeReservationLifecycleInput["lifecycleState"],
  flags: Pick<
    LiveSmokeReservationLifecycleInput,
    "providerRequestSent" | "providerResponseReceived" | "billableRequestCount"
  >,
): LiveSmokeReservationLifecycleInput {
  return { ...base, lifecycleState, ...flags };
}

export function createLiveSmokeHandler(
  gateway: AgentProviderGateway,
  budgetStore: LiveSmokeBudgetStore,
  options: {
    readonly providerMode?: LiveSmokeProviderMode;
    readonly lifecycleStore?: LiveSmokeLifecycleStore;
  } = {},
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
        const key = reservationKey(kind);
        let reserved = false;
        let dispatchStarted = false;
        try {
          const reservation = await budgetStore.reserve({
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey: key,
            providerMode,
            units: 1,
            limit: workflowCallBudget,
          });
          if (!reservation.allowed) throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_REACHED");
          if (reservation.duplicate)
            throw budgetError("LIVE_SMOKE_DUPLICATE_PROVIDER_CALL_BLOCKED");
          reserved = true;
          const base = {
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey: key,
            agentCode: payload.agentCode,
            providerMode,
          } as const;
          await options.lifecycleStore?.record(
            lifecycleInput(base, "RESERVED", {
              providerRequestSent: false,
              providerResponseReceived: false,
              billableRequestCount: 0,
            }),
          );
          await options.lifecycleStore?.record(
            lifecycleInput(base, "DISPATCH_STARTED", {
              providerRequestSent: true,
              providerResponseReceived: false,
              billableRequestCount: 1,
            }),
          );
          dispatchStarted = true;
        } catch (error) {
          if (reserved && !dispatchStarted) {
            await budgetStore.releasePreDispatch?.({
              workspaceId,
              smokeRunId,
              budgetEpochId,
              reservationKey: key,
            });
            await options.lifecycleStore?.record(
              lifecycleInput(
                {
                  workspaceId,
                  smokeRunId,
                  budgetEpochId,
                  reservationKey: key,
                  agentCode: payload.agentCode,
                  providerMode,
                },
                "RELEASED_PRE_DISPATCH",
                {
                  providerRequestSent: false,
                  providerResponseReceived: false,
                  billableRequestCount: 0,
                },
              ),
            );
          }
          throw error;
        }
      },
      afterProviderCall: async (kind, providerResult) => {
        if (providerMode !== "live") return;
        const providerFacts = {
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey: reservationKey(kind),
          agentCode: payload.agentCode,
          providerMode,
          ...(providerResult.providerRequestId
            ? { providerRequestId: providerResult.providerRequestId }
            : {}),
          ...(providerResult.usage?.inputUnits === undefined
            ? {}
            : { inputUnits: providerResult.usage.inputUnits }),
          ...(providerResult.usage?.outputUnits === undefined
            ? {}
            : { outputUnits: providerResult.usage.outputUnits }),
          ...(providerResult.error?.code ? { terminalErrorCode: providerResult.error.code } : {}),
        } as const;
        await options.lifecycleStore?.record(
          lifecycleInput(providerFacts, "PROVIDER_RESPONDED", {
            providerRequestSent: true,
            providerResponseReceived: true,
            billableRequestCount: 1,
          }),
        );
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
  options: {
    readonly providerMode: LiveSmokeProviderMode;
    readonly lifecycleStore?: LiveSmokeLifecycleStore;
  },
): LiveSmokeRuntimeHandler {
  const liveSmoke = createLiveSmokeHandler(gateway, budgetStore, {
    providerMode: "live",
    ...(options.lifecycleStore ? { lifecycleStore: options.lifecycleStore } : {}),
  });
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    if (options.providerMode !== "live") {
      throw Object.assign(new Error("LIVE_SMOKE_VERIFICATION_REQUIRES_LIVE"), {
        code: "LIVE_SMOKE_VERIFICATION_REQUIRES_LIVE",
        retryable: false as const,
      });
    }
    const payload = job.data as AiLiveSmokeVerificationPayload;
    if (payload.verificationOnly !== true) throw new Error("LIVE_SMOKE_VERIFICATION_FLAG_REQUIRED");
    if (
      options.lifecycleStore &&
      (await options.lifecycleStore.getCanaryStatus(payload.verificationRunId)) !== "PASS"
    )
      throw Object.assign(new Error("LIVE_SMOKE_PROVIDER_CANARY_REQUIRED"), {
        code: "LIVE_SMOKE_PROVIDER_CANARY_REQUIRED",
        retryable: false as const,
      });
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

const CANARY_SCHEMA: JsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["status", "environment", "provider"],
  properties: {
    status: { enum: ["ok"] },
    environment: { enum: ["staging"] },
    provider: { enum: ["openai"] },
  },
});

function isCanaryOutput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const output = value as Record<string, unknown>;
  return output.status === "ok" && output.environment === "staging" && output.provider === "openai";
}

/** Executes the single provider-accessibility call before any agent coverage item. */
export function createLiveSmokeProviderCanaryHandler(
  gateway: AgentProviderGateway,
  budgetStore: LiveSmokeBudgetStore,
  lifecycleStore: LiveSmokeLifecycleStore,
  options: { readonly providerMode: LiveSmokeProviderMode },
): LiveSmokeRuntimeHandler {
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    if (options.providerMode !== "live") {
      throw Object.assign(new Error("LIVE_SMOKE_CANARY_REQUIRES_LIVE"), {
        code: "LIVE_SMOKE_CANARY_REQUIRES_LIVE",
        retryable: false as const,
      });
    }
    const payload = job.data as AiLiveSmokeCanaryPayload;
    if (payload.canary !== true) throw new Error("LIVE_SMOKE_CANARY_FLAG_REQUIRED");
    const workspaceId = invocation?.workspaceId ?? payload.workspaceId;
    const smokeRunId = invocation?.smokeRunId ?? payload.smokeRunId;
    const budgetEpochId = invocation?.budgetEpochId ?? payload.budgetEpochId;
    const jobItemId = invocation?.jobItemId ?? String(job.id ?? "provider-canary");
    const deliveryAttempt = Number.isInteger(job.attemptsMade) ? job.attemptsMade : 0;
    const reservationKey = `${budgetEpochId}:${jobItemId}:delivery:${deliveryAttempt}:canary`;
    const base = {
      workspaceId,
      smokeRunId,
      budgetEpochId,
      reservationKey,
      agentCode: "PROVIDER_ACCESSIBILITY_CANARY",
      providerMode: "live" as const,
    };
    const reservation = await budgetStore.reserve({
      workspaceId,
      smokeRunId,
      budgetEpochId,
      reservationKey,
      providerMode: "live",
      units: 1,
      limit: payload.workflowCallBudget,
    });
    if (!reservation.allowed) throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_REACHED");
    if (reservation.duplicate) throw budgetError("LIVE_SMOKE_DUPLICATE_PROVIDER_CALL_BLOCKED");
    let dispatchStarted = false;
    try {
      await lifecycleStore.record(
        lifecycleInput(base, "RESERVED", {
          providerRequestSent: false,
          providerResponseReceived: false,
          billableRequestCount: 0,
        }),
      );
      await lifecycleStore.record(
        lifecycleInput(base, "DISPATCH_STARTED", {
          providerRequestSent: true,
          providerResponseReceived: false,
          billableRequestCount: 1,
        }),
      );
      dispatchStarted = true;
    } catch (error) {
      if (!dispatchStarted) {
        await budgetStore.releasePreDispatch?.({
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey,
        });
        await lifecycleStore.record(
          lifecycleInput(base, "RELEASED_PRE_DISPATCH", {
            providerRequestSent: false,
            providerResponseReceived: false,
            billableRequestCount: 0,
          }),
        );
      }
      throw error;
    }

    let result;
    try {
      result = await gateway.execute({
        taskId: `gate-h-2c7-canary-${jobItemId}`,
        modelPolicyId: "balanced-structured-v1",
        messages: [
          {
            role: "system",
            content: "Staging provider canary. Return only the registered JSON object.",
          },
          { role: "user", content: "Return status ok, environment staging, provider openai." },
        ],
        outputSchema: CANARY_SCHEMA,
        imageInputs: [],
        timeoutSeconds: 60,
        metadata: {
          workspaceId,
          agentCode: "PROVIDER_ACCESSIBILITY_CANARY",
          promptVersion: "1.0.0",
          correlationId: `gate-h-2c7-canary-${jobItemId}`,
        },
      });
    } catch (error) {
      await lifecycleStore.record(
        lifecycleInput(
          { ...base, terminalErrorCode: "PROVIDER_EXECUTION_THROWN" },
          "PROVIDER_RESPONDED",
          { providerRequestSent: true, providerResponseReceived: true, billableRequestCount: 1 },
        ),
      );
      await lifecycleStore.recordCanary({
        verificationRunId: payload.verificationRunId,
        providerRequestSent: true,
        providerResponseReceived: true,
        http200: false,
        strictOutputValid: false,
        domainValidationValid: false,
        storeDisabled: true,
        backgroundDisabled: true,
        toolsUnused: true,
        passed: false,
        errorCode: "PROVIDER_EXECUTION_THROWN",
      });
      throw error;
    }
    const providerFacts = {
      ...base,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(result.usage?.inputUnits === undefined ? {} : { inputUnits: result.usage.inputUnits }),
      ...(result.usage?.outputUnits === undefined ? {} : { outputUnits: result.usage.outputUnits }),
      ...(result.error?.code ? { terminalErrorCode: result.error.code } : {}),
    } as const;
    await lifecycleStore.record(
      lifecycleInput(providerFacts, "PROVIDER_RESPONDED", {
        providerRequestSent: true,
        providerResponseReceived: true,
        billableRequestCount: 1,
      }),
    );
    const http200 = result.httpStatus === 200 || result.status === "COMPLETED";
    const strictOutputValid = result.status === "COMPLETED" && isCanaryOutput(result.outputJson);
    const domainValidationValid = strictOutputValid;
    const passed =
      http200 && result.model === "gpt-5.6-luna" && strictOutputValid && domainValidationValid;
    await lifecycleStore.recordCanary({
      verificationRunId: payload.verificationRunId,
      providerRequestSent: true,
      providerResponseReceived: true,
      http200,
      ...(result.model ? { resolvedModel: result.model } : {}),
      strictOutputValid,
      domainValidationValid,
      storeDisabled: true,
      backgroundDisabled: true,
      toolsUnused: true,
      passed,
      ...(result.error?.code ? { errorCode: result.error.code } : {}),
    });
    if (!passed)
      throw Object.assign(new Error("LIVE_SMOKE_PROVIDER_CANARY_FAILED"), {
        code: "LIVE_SMOKE_PROVIDER_CANARY_FAILED",
        retryable: false as const,
      });
    return {
      status: "COMPLETED",
      canary: "PASS",
      provider: "OpenAI",
      model: result.model,
      providerRequestSent: true,
      strictOutputValid: true,
      domainValidationValid: true,
    };
  };
}
