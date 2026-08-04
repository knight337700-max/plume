import type { Job } from "bullmq";
import { agentSchemas } from "../../../../../packages/contracts/src/agent-schemas/index.js";
import {
  AGENT_CODES,
  promptRegistry,
  type AgentCode,
} from "../../../../../packages/core/src/agents/prompt-registry.js";
import { modelPolicyRegistry } from "../../../../../packages/core/src/agents/model-policy-registry.js";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
  type ProviderCallKind,
  type ProviderEvidence,
  type ProviderResult,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import type {
  JsonSchema,
  ValidationEvidence,
} from "../../../../../packages/core/src/agents/result-validator.js";
import {
  LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX,
  type AiLiveSmokeCanaryPayload,
  type AiLiveSmokePayload,
  type AiLiveSmokeVerificationPayload,
} from "../../../../../packages/contracts/src/async.js";
import type {
  LiveSmokeBudgetStore,
  LiveSmokeProviderMode,
} from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import {
  isApprovedLiveSmokeSyntheticScenarioId,
  resolveLiveSmokeSyntheticScenario,
} from "../../../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";
import {
  assertLiveSmokeInputEstimate,
  calculateLiveSmokeCostMicroUsd,
  calculateLiveSmokeReservationMicroUsd,
  estimateLiveSmokeInputTokens,
  type LiveSmokePricingPolicy,
} from "../../../../../packages/infrastructure/src/async/live-smoke-spend-policy.js";
import type { LiveSmokeCoverageStore } from "../../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import type {
  LiveSmokeLifecycleStore,
  LiveSmokeReservationLifecycleInput,
} from "../../../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";
import type {
  LiveSmokeValidationEvidenceStage,
  LiveSmokeValidationEvidenceStore,
} from "../../../../../packages/infrastructure/src/async/live-smoke-validation-evidence-store.js";

function isAgentCode(value: string): value is AgentCode {
  return (AGENT_CODES as readonly string[]).includes(value);
}

export interface LiveSmokeInvocationContext {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly jobItemId: string;
  readonly syntheticScenarioId?: string;
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

export interface LiveSmokeCallEvidence {
  readonly callKind: ProviderCallKind;
  readonly providerEvidence?: ProviderEvidence;
  readonly validationEvidence?: ValidationEvidence;
}

function evidenceModel(result: ProviderResult): string | undefined {
  return result.evidence?.resolvedModel ?? result.model;
}

function evidenceRequestHash(result: ProviderResult): string | undefined {
  return result.evidence?.requestIdHash ?? result.providerRequestIdHash;
}

function assertInvocationScope(
  payload: {
    readonly workspaceId?: string;
    readonly smokeRunId?: string;
    readonly budgetEpochId: string;
    readonly syntheticScenarioId?: string;
  },
  invocation: LiveSmokeInvocationContext | undefined,
  scenarioId: string,
): void {
  if (payload.syntheticScenarioId !== scenarioId)
    throw new Error("LIVE_SMOKE_SYNTHETIC_SCENARIO_REQUIRED");
  if (
    invocation &&
    ((payload.workspaceId && payload.workspaceId !== invocation.workspaceId) ||
      (payload.smokeRunId && payload.smokeRunId !== invocation.smokeRunId) ||
      payload.budgetEpochId !== invocation.budgetEpochId ||
      (invocation.syntheticScenarioId && invocation.syntheticScenarioId !== scenarioId))
  )
    throw new Error("LIVE_SMOKE_SCOPE_MISMATCH");
}

export function createLiveSmokeHandler(
  gateway: AgentProviderGateway,
  budgetStore: LiveSmokeBudgetStore,
  options: {
    readonly providerMode?: LiveSmokeProviderMode;
    readonly pricingPolicy?: LiveSmokePricingPolicy;
    readonly lifecycleStore?: LiveSmokeLifecycleStore;
    readonly validationEvidenceStore?: LiveSmokeValidationEvidenceStore;
    readonly onCoverageWrite?: (
      evidence: LiveSmokeCallEvidence | undefined,
      result: { readonly succeeded: boolean; readonly errorCode?: string },
      context: {
        readonly workspaceId: string;
        readonly smokeRunId: string;
        readonly budgetEpochId: string;
        readonly verificationRunId?: string;
        readonly jobItemId: string;
        readonly agentCode: string;
      },
    ) => Promise<void>;
  } = {},
): LiveSmokeRuntimeHandler {
  const providerMode = options.providerMode ?? "live";
  return async (job: Job<unknown>, invocation?: LiveSmokeInvocationContext) => {
    const payload = job.data as AiLiveSmokePayload & { readonly workspaceId?: string };
    if (!isApprovedLiveSmokeSyntheticScenarioId(payload.syntheticScenarioId))
      throw new Error("LIVE_SMOKE_SYNTHETIC_SCENARIO_REQUIRED");
    const scenario = resolveLiveSmokeSyntheticScenario(payload.syntheticScenarioId);
    assertInvocationScope(payload, invocation, scenario.id);
    if (!isAgentCode(payload.agentCode)) throw new Error("AI_LIVE_SMOKE_AGENT_NOT_REGISTERED");
    const workspaceId =
      invocation?.workspaceId ?? payload.workspaceId ?? "00000000-0000-4000-8000-0000000002c0";
    const smokeRunId =
      invocation?.smokeRunId ?? payload.smokeRunId ?? String(job.id ?? workspaceId);
    const budgetEpochId = invocation?.budgetEpochId ?? payload.budgetEpochId;
    if (!budgetEpochId) throw budgetError("LIVE_SMOKE_BUDGET_EPOCH_REQUIRED");
    const jobItemId = invocation?.jobItemId ?? String(job.id ?? `${payload.agentCode}-live-smoke`);
    const verificationRunId = (payload as { readonly verificationRunId?: string })
      .verificationRunId;
    const prompt = promptRegistry.resolve(payload.agentCode);
    const modelPolicy = modelPolicyRegistry.forAgent(payload.agentCode);
    const schema = (agentSchemas as Readonly<Record<string, unknown>>)[prompt.outputSchemaId];
    if (!schema) throw new Error(`AI_LIVE_SMOKE_SCHEMA_NOT_FOUND:${prompt.outputSchemaId}`);
    const requestMessages =
      payload.agentCode === "LAYOUT_PLANNER" ? scenario.layoutMessages : scenario.messages;
    const estimatedInputTokens = estimateLiveSmokeInputTokens({
      messages: requestMessages,
      outputSchema: schema,
      metadata: { agentCode: payload.agentCode, model: options.pricingPolicy?.model },
    });
    if (providerMode === "live") {
      if (!options.pricingPolicy) throw budgetError("LIVE_SMOKE_PRICING_POLICY_REQUIRED");
      assertLiveSmokeInputEstimate(options.pricingPolicy, estimatedInputTokens);
    }
    const workflowCallBudget =
      Number.isInteger(payload.workflowCallBudget) && payload.workflowCallBudget! > 0
        ? payload.workflowCallBudget!
        : Number.isInteger(payload.requestBudget) && payload.requestBudget! > 0
          ? payload.requestBudget!
          : 20;
    if (workflowCallBudget > LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX)
      throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_INVALID");
    if (
      providerMode === "live" &&
      options.pricingPolicy?.absoluteProviderCallCap !== undefined &&
      workflowCallBudget !== options.pricingPolicy.absoluteProviderCallCap
    )
      throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_POLICY_MISMATCH");
    const retryEnabled = payload.retryEnabled ?? true;
    const repairEnabled = payload.repairEnabled ?? true;
    const deliveryAttempt =
      Number.isInteger(job.attemptsMade) && job.attemptsMade >= 0 ? job.attemptsMade : 0;
    const reservationKey = (kind: ProviderCallKind): string =>
      `${budgetEpochId}:${jobItemId}:delivery:${deliveryAttempt}:${kind}`;
    let lastCallEvidence: LiveSmokeCallEvidence | undefined;
    const recordEvidence = async (input: {
      readonly evidenceStage: LiveSmokeValidationEvidenceStage;
      readonly callKind: ProviderCallKind;
      readonly providerResult?: ProviderResult;
      readonly validation?: ValidationEvidence;
      readonly sdkRequestAttempted?: boolean;
      readonly providerResponseReceived?: boolean;
      readonly coverageWriteAttempted?: boolean;
      readonly coverageWriteSucceeded?: boolean;
      readonly coverageWriteErrorCode?: string;
    }) => {
      if (providerMode !== "live" || !options.validationEvidenceStore) return;
      const providerEvidence = input.providerResult?.evidence;
      const validation = input.validation;
      const providerRequestIdHash = input.providerResult
        ? evidenceRequestHash(input.providerResult)
        : undefined;
      const resolvedModel = input.providerResult ? evidenceModel(input.providerResult) : undefined;
      const record = {
        evidenceKey: `${reservationKey(input.callKind)}:${input.evidenceStage}`,
        evidenceStage: input.evidenceStage,
        workspaceId,
        smokeRunId,
        budgetEpochId,
        ...(verificationRunId ? { verificationRunId } : {}),
        jobItemId,
        agentCode: payload.agentCode,
        callKind: input.callKind,
        sdkRequestAttempted:
          input.sdkRequestAttempted ?? providerEvidence?.requestAttempted ?? false,
        providerResponseReceived:
          input.providerResponseReceived ?? providerEvidence?.responseReceived ?? false,
        ...(providerEvidence?.httpStatus === undefined
          ? input.providerResult?.httpStatus === undefined
            ? {}
            : { providerHttpStatus: input.providerResult.httpStatus }
          : { providerHttpStatus: providerEvidence.httpStatus }),
        ...(providerRequestIdHash ? { providerRequestIdHash } : {}),
        ...(resolvedModel ? { resolvedModel } : {}),
        jsonParseStatus:
          providerEvidence?.jsonParseStatus ?? validation?.jsonParseStatus ?? "NOT_REACHED",
        transportValidationStatus: validation?.transportValidationStatus ?? "NOT_REACHED",
        ...(validation?.transportErrorCode
          ? { transportErrorCode: validation.transportErrorCode }
          : {}),
        transportErrorPaths: validation?.transportErrorPaths ?? [],
        domainValidationStatus: validation?.domainValidationStatus ?? "NOT_REACHED",
        ...(validation?.domainErrorCode ? { domainErrorCode: validation.domainErrorCode } : {}),
        domainErrorPaths: validation?.domainErrorPaths ?? [],
        repairEligible:
          input.providerResult?.status === "COMPLETED" &&
          (validation?.transportValidationStatus === "FAIL" ||
            validation?.domainValidationStatus === "FAIL"),
        retryEligible: input.providerResult?.error?.retryable === true,
        coverageWriteAttempted: input.coverageWriteAttempted ?? false,
        coverageWriteSucceeded: input.coverageWriteSucceeded ?? false,
        ...(input.coverageWriteErrorCode
          ? { coverageWriteErrorCode: input.coverageWriteErrorCode }
          : {}),
        ...(input.providerResult?.usage?.inputUnits === undefined
          ? {}
          : { inputUnits: input.providerResult.usage.inputUnits }),
        ...(input.providerResult?.usage?.cachedInputUnits === undefined
          ? {}
          : { cachedInputUnits: input.providerResult.usage.cachedInputUnits }),
        ...(input.providerResult?.usage?.outputUnits === undefined
          ? {}
          : { outputUnits: input.providerResult.usage.outputUnits }),
        ...(providerEvidence?.outputFingerprint
          ? { outputFingerprint: providerEvidence.outputFingerprint }
          : {}),
        ...(providerEvidence?.outputLengthBytes === undefined
          ? {}
          : { outputLengthBytes: providerEvidence.outputLengthBytes }),
      } as const;
      await options.validationEvidenceStore.record(record);
    };
    const orchestrator = createAgentOrchestrator({
      gateway,
      retryEnabled,
      repairEnabled,
      beforeProviderCall: async (kind) => {
        if (providerMode === "mock") return;
        if (!options.pricingPolicy) throw budgetError("LIVE_SMOKE_PRICING_POLICY_REQUIRED");
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
            reservedMicroUsd: calculateLiveSmokeReservationMicroUsd(
              options.pricingPolicy,
              modelPolicy.maxInputUnits,
              modelPolicy.maxOutputUnits,
            ),
            estimatedInputTokens,
            model: options.pricingPolicy.model,
            pricingVersion: options.pricingPolicy.pricingVersion,
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
          const reservedEvent = await options.lifecycleStore?.record(
            lifecycleInput(base, "RESERVED", {
              providerRequestSent: false,
              providerResponseReceived: false,
              billableRequestCount: 0,
            }),
          );
          if (reservedEvent && !reservedEvent.inserted)
            throw budgetError("LIVE_SMOKE_RESERVED_LIFECYCLE_WRITE_FAILED");
          const dispatchEvent = await options.lifecycleStore?.record(
            lifecycleInput(base, "DISPATCH_STARTED", {
              providerRequestSent: false,
              providerResponseReceived: false,
              billableRequestCount: 0,
            }),
          );
          if (dispatchEvent && !dispatchEvent.inserted)
            throw budgetError("LIVE_SMOKE_DISPATCH_LIFECYCLE_WRITE_FAILED");
          const dispatch = await budgetStore.markDispatchStarted({
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey: key,
          });
          if (!dispatch.marked && dispatch.duplicate)
            throw budgetError("LIVE_SMOKE_DISPATCH_ALREADY_STARTED");
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
        const providerEvidence = providerResult.evidence;
        const requestAttempted = providerEvidence?.requestAttempted === true;
        const responseReceived = providerEvidence?.responseReceived === true;
        const providerFacts = {
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey: reservationKey(kind),
          agentCode: payload.agentCode,
          providerMode,
          ...((providerResult.evidence?.requestIdHash ?? providerResult.providerRequestIdHash)
            ? {
                providerRequestIdHash:
                  providerResult.evidence?.requestIdHash ?? providerResult.providerRequestIdHash,
              }
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
            providerRequestSent: requestAttempted,
            providerResponseReceived: responseReceived,
            billableRequestCount: requestAttempted ? 1 : 0,
          }),
        );
        const requestIdHash = evidenceRequestHash(providerResult);
        const usage = providerResult.usage;
        const unknownBillable = !requestAttempted || !responseReceived || !requestIdHash || !usage;
        await recordEvidence({
          evidenceStage: "PROVIDER_RESPONSE",
          callKind: kind,
          providerResult,
        });
        if (unknownBillable) {
          await budgetStore.markUnknownBillable({
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey: reservationKey(kind),
          });
          throw budgetError("LIVE_SMOKE_UNKNOWN_BILLABLE");
        } else {
          try {
            await budgetStore.settle({
              workspaceId,
              smokeRunId,
              budgetEpochId,
              reservationKey: reservationKey(kind),
              providerRequestIdHash: requestIdHash,
              model: evidenceModel(providerResult) ?? options.pricingPolicy?.model ?? "",
              pricingVersion: options.pricingPolicy?.pricingVersion ?? "",
              inputUnits: usage.inputUnits,
              cachedInputUnits: usage.cachedInputUnits ?? 0,
              outputUnits: usage.outputUnits,
              settledMicroUsd: calculateLiveSmokeCostMicroUsd(options.pricingPolicy!, usage),
            });
          } catch {
            await budgetStore.markUnknownBillable({
              workspaceId,
              smokeRunId,
              budgetEpochId,
              reservationKey: reservationKey(kind),
            });
            throw budgetError("LIVE_SMOKE_UNKNOWN_BILLABLE");
          }
        }
      },
      afterProviderValidation: async (kind, providerResult, validation) => {
        lastCallEvidence = {
          callKind: kind,
          ...(providerResult.evidence ? { providerEvidence: providerResult.evidence } : {}),
          ...(validation ? { validationEvidence: validation } : {}),
        };
        await recordEvidence({
          evidenceStage: "VALIDATION",
          callKind: kind,
          providerResult,
          ...(validation ? { validation } : {}),
        });
      },
    });
    const result = await orchestrator.run({
      taskId: String(job.id ?? `${payload.agentCode}-live-smoke`),
      agentCode: payload.agentCode,
      correlationId: String(job.id ?? `${payload.agentCode}-live-smoke`),
      workspaceId,
      subjectType: "CAMPAIGN",
      subjectId: (scenario.agentData.campaign as { readonly id: string }).id,
      locale: scenario.locale,
      data: scenario.agentData,
      messages: requestMessages,
      outputSchema: schema as unknown as JsonSchema,
      syntheticScenarioId: scenario.id,
      channelCode: scenario.channel.code,
      formatProfileId: scenario.formatProfile.id as string,
      profileVersion: scenario.formatProfile.version as string,
      synthetic: true,
      timeoutSeconds: 60,
      onSdkRequestAttempt: async (kind) => {
        if (providerMode === "live" && options.lifecycleStore) {
          const updated = await options.lifecycleStore.markProviderRequestAttempt({
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey: reservationKey(kind),
          });
          if (!updated.updated) throw budgetError("LIVE_SMOKE_SDK_ATTEMPT_BOUNDARY_FAILED");
        }
        await recordEvidence({
          evidenceStage: "SDK_ATTEMPT",
          callKind: kind,
          sdkRequestAttempted: true,
          providerResponseReceived: false,
        });
      },
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
      ...(lastCallEvidence ? { evidence: lastCallEvidence } : {}),
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
    readonly pricingPolicy?: LiveSmokePricingPolicy;
    readonly lifecycleStore?: LiveSmokeLifecycleStore;
    readonly validationEvidenceStore?: LiveSmokeValidationEvidenceStore;
  },
): LiveSmokeRuntimeHandler {
  const onCoverageWrite = options.validationEvidenceStore
    ? async (
        evidence: LiveSmokeCallEvidence | undefined,
        write: { readonly succeeded: boolean; readonly errorCode?: string },
        context: {
          readonly workspaceId: string;
          readonly smokeRunId: string;
          readonly budgetEpochId: string;
          readonly verificationRunId?: string;
          readonly jobItemId: string;
          readonly agentCode: string;
        },
      ) => {
        if (!evidence) throw new Error("LIVE_SMOKE_VALIDATION_EVIDENCE_MISSING");
        const providerEvidence = evidence.providerEvidence;
        const validation = evidence.validationEvidence;
        await options.validationEvidenceStore!.record({
          evidenceKey: `${context.budgetEpochId}:${context.jobItemId}:delivery:0:${evidence.callKind}:COVERAGE_WRITE`,
          evidenceStage: "COVERAGE_WRITE",
          workspaceId: context.workspaceId,
          smokeRunId: context.smokeRunId,
          budgetEpochId: context.budgetEpochId,
          ...(context.verificationRunId ? { verificationRunId: context.verificationRunId } : {}),
          jobItemId: context.jobItemId,
          agentCode: context.agentCode,
          callKind: evidence.callKind,
          sdkRequestAttempted: providerEvidence?.requestAttempted === true,
          providerResponseReceived: providerEvidence?.responseReceived === true,
          ...(providerEvidence?.httpStatus === undefined
            ? {}
            : { providerHttpStatus: providerEvidence.httpStatus }),
          ...(providerEvidence?.requestIdHash
            ? { providerRequestIdHash: providerEvidence.requestIdHash }
            : {}),
          ...(providerEvidence?.resolvedModel
            ? { resolvedModel: providerEvidence.resolvedModel }
            : {}),
          jsonParseStatus: providerEvidence?.jsonParseStatus ?? "NOT_REACHED",
          transportValidationStatus: validation?.transportValidationStatus ?? "NOT_REACHED",
          ...(validation?.transportErrorCode
            ? { transportErrorCode: validation.transportErrorCode }
            : {}),
          transportErrorPaths: validation?.transportErrorPaths ?? [],
          domainValidationStatus: validation?.domainValidationStatus ?? "NOT_REACHED",
          ...(validation?.domainErrorCode ? { domainErrorCode: validation.domainErrorCode } : {}),
          domainErrorPaths: validation?.domainErrorPaths ?? [],
          repairEligible: false,
          retryEligible: false,
          coverageWriteAttempted: true,
          coverageWriteSucceeded: write.succeeded,
          ...(write.errorCode ? { coverageWriteErrorCode: write.errorCode } : {}),
          ...(providerEvidence?.inputUnits === undefined
            ? {}
            : { inputUnits: providerEvidence.inputUnits }),
          ...(providerEvidence?.cachedInputUnits === undefined
            ? {}
            : { cachedInputUnits: providerEvidence.cachedInputUnits }),
          ...(providerEvidence?.outputUnits === undefined
            ? {}
            : { outputUnits: providerEvidence.outputUnits }),
          ...(providerEvidence?.outputFingerprint
            ? { outputFingerprint: providerEvidence.outputFingerprint }
            : {}),
          ...(providerEvidence?.outputLengthBytes === undefined
            ? {}
            : { outputLengthBytes: providerEvidence.outputLengthBytes }),
        });
      }
    : undefined;
  const liveSmoke = createLiveSmokeHandler(gateway, budgetStore, {
    providerMode: "live",
    ...(options.pricingPolicy ? { pricingPolicy: options.pricingPolicy } : {}),
    ...(options.lifecycleStore ? { lifecycleStore: options.lifecycleStore } : {}),
    ...(options.validationEvidenceStore
      ? { validationEvidenceStore: options.validationEvidenceStore }
      : {}),
    ...(onCoverageWrite ? { onCoverageWrite } : {}),
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
      (await options.lifecycleStore.getCanaryStatus(
        payload.canaryVerificationRunId ?? payload.verificationRunId,
      )) !== "PASS"
    )
      throw Object.assign(new Error("LIVE_SMOKE_PROVIDER_CANARY_REQUIRED"), {
        code: "LIVE_SMOKE_PROVIDER_CANARY_REQUIRED",
        retryable: false as const,
      });
    const result = (await liveSmoke(job, invocation)) as {
      readonly status: string;
      readonly agentCode: string;
      readonly evidence?: LiveSmokeCallEvidence;
      readonly metadata?: {
        readonly model?: string;
        readonly providerRequestIdHash?: string;
        readonly usage?: { readonly inputUnits?: number; readonly outputUnits?: number };
      };
    };
    if (result.status !== "COMPLETED") throw new Error("LIVE_SMOKE_VERIFICATION_RESULT_INCOMPLETE");
    if (result.metadata?.model !== "gpt-5.6-luna")
      throw new Error("LIVE_SMOKE_VERIFICATION_MODEL_MISMATCH");
    const providerEvidence = result.evidence?.providerEvidence;
    const validationEvidence = result.evidence?.validationEvidence;
    if (
      providerEvidence?.requestAttempted !== true ||
      providerEvidence.responseReceived !== true ||
      providerEvidence.httpStatus !== 200 ||
      providerEvidence.resolvedModel !== "gpt-5.6-luna" ||
      providerEvidence.jsonParseStatus !== "PASS" ||
      validationEvidence?.transportValidationStatus !== "PASS" ||
      validationEvidence?.domainValidationStatus !== "PASS"
    )
      throw new Error("LIVE_SMOKE_VERIFICATION_VALIDATION_INCOMPLETE");
    const workspaceId = invocation?.workspaceId ?? payload.workspaceId;
    const smokeRunId = invocation?.smokeRunId ?? payload.smokeRunId;
    const budgetEpochId = invocation?.budgetEpochId ?? payload.budgetEpochId;
    const jobItemId = invocation?.jobItemId ?? String(job.id ?? payload.agentCode);
    try {
      const coverageResult = await coverageStore.recordCoverage({
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
        ...(result.metadata.providerRequestIdHash
          ? { providerRequestIdHash: result.metadata.providerRequestIdHash }
          : {}),
        ...(result.metadata.usage?.inputUnits === undefined
          ? {}
          : { inputUnits: result.metadata.usage.inputUnits }),
        ...(result.metadata.usage?.outputUnits === undefined
          ? {}
          : { outputUnits: result.metadata.usage.outputUnits }),
      });
      await onCoverageWrite?.(
        result.evidence,
        {
          succeeded: true,
          ...(coverageResult.inserted ? {} : { errorCode: "IDEMPOTENT_EXISTING_RECORD" }),
        },
        {
          workspaceId,
          smokeRunId,
          budgetEpochId,
          verificationRunId: payload.verificationRunId,
          jobItemId,
          agentCode: result.agentCode,
        },
      );
    } catch (error) {
      await onCoverageWrite?.(
        result.evidence,
        {
          succeeded: false,
          errorCode: error instanceof Error ? "COVERAGE_WRITE_FAILED" : "COVERAGE_WRITE_FAILED",
        },
        {
          workspaceId,
          smokeRunId,
          budgetEpochId,
          verificationRunId: payload.verificationRunId,
          jobItemId,
          agentCode: result.agentCode,
        },
      );
      throw error;
    }
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
  options: {
    readonly providerMode: LiveSmokeProviderMode;
    readonly pricingPolicy?: LiveSmokePricingPolicy;
  },
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
    if (!isApprovedLiveSmokeSyntheticScenarioId(payload.syntheticScenarioId))
      throw new Error("LIVE_SMOKE_SYNTHETIC_SCENARIO_REQUIRED");
    const scenario = resolveLiveSmokeSyntheticScenario(payload.syntheticScenarioId);
    assertInvocationScope(payload, invocation, scenario.id);
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
    if (!options.pricingPolicy) throw budgetError("LIVE_SMOKE_PRICING_POLICY_REQUIRED");
    if (
      options.pricingPolicy.absoluteProviderCallCap !== undefined &&
      payload.workflowCallBudget !== options.pricingPolicy.absoluteProviderCallCap
    )
      throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_POLICY_MISMATCH");
    const canaryPolicy = modelPolicyRegistry.resolve("balanced-structured-v1");
    const estimatedInputTokens = estimateLiveSmokeInputTokens({
      messages: [...scenario.canaryMessages],
      outputSchema: CANARY_SCHEMA,
      metadata: { agentCode: "PROVIDER_ACCESSIBILITY_CANARY", model: options.pricingPolicy.model },
    });
    assertLiveSmokeInputEstimate(options.pricingPolicy, estimatedInputTokens);
    const reservation = await budgetStore.reserve({
      workspaceId,
      smokeRunId,
      budgetEpochId,
      reservationKey,
      providerMode: "live",
      units: 1,
      limit: payload.workflowCallBudget,
      reservedMicroUsd: calculateLiveSmokeReservationMicroUsd(
        options.pricingPolicy,
        canaryPolicy.maxInputUnits,
        canaryPolicy.maxOutputUnits,
      ),
      estimatedInputTokens,
      model: options.pricingPolicy.model,
      pricingVersion: options.pricingPolicy.pricingVersion,
    });
    if (!reservation.allowed) throw budgetError("LIVE_SMOKE_REQUEST_BUDGET_REACHED");
    if (reservation.duplicate) throw budgetError("LIVE_SMOKE_DUPLICATE_PROVIDER_CALL_BLOCKED");
    let dispatchStarted = false;
    try {
      const reservedEvent = await lifecycleStore.record(
        lifecycleInput(base, "RESERVED", {
          providerRequestSent: false,
          providerResponseReceived: false,
          billableRequestCount: 0,
        }),
      );
      if (!reservedEvent.inserted) throw budgetError("LIVE_SMOKE_RESERVED_LIFECYCLE_WRITE_FAILED");
      const dispatchEvent = await lifecycleStore.record(
        lifecycleInput(base, "DISPATCH_STARTED", {
          providerRequestSent: false,
          providerResponseReceived: false,
          billableRequestCount: 0,
        }),
      );
      if (!dispatchEvent.inserted) throw budgetError("LIVE_SMOKE_DISPATCH_LIFECYCLE_WRITE_FAILED");
      const dispatch = await budgetStore.markDispatchStarted({
        workspaceId,
        smokeRunId,
        budgetEpochId,
        reservationKey,
      });
      if (!dispatch.marked && dispatch.duplicate)
        throw budgetError("LIVE_SMOKE_DISPATCH_ALREADY_STARTED");
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
          syntheticScenarioId: scenario.id,
          channelCode: scenario.channel.code,
          formatProfileId: scenario.formatProfile.id as string,
          profileVersion: scenario.formatProfile.version as string,
          synthetic: true,
        },
        onSdkRequestAttempt: async () => {
          const updated = await lifecycleStore.markProviderRequestAttempt({
            workspaceId,
            smokeRunId,
            budgetEpochId,
            reservationKey,
          });
          if (!updated.updated) throw budgetError("LIVE_SMOKE_SDK_ATTEMPT_BOUNDARY_FAILED");
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
      ...((result.evidence?.requestIdHash ?? result.providerRequestIdHash)
        ? {
            providerRequestIdHash: result.evidence?.requestIdHash ?? result.providerRequestIdHash,
          }
        : {}),
      ...(result.usage?.inputUnits === undefined ? {} : { inputUnits: result.usage.inputUnits }),
      ...(result.usage?.cachedInputUnits === undefined
        ? {}
        : { cachedInputUnits: result.usage.cachedInputUnits }),
      ...(result.usage?.outputUnits === undefined ? {} : { outputUnits: result.usage.outputUnits }),
      ...(result.error?.code ? { terminalErrorCode: result.error.code } : {}),
    } as const;
    await lifecycleStore.record(
      lifecycleInput(providerFacts, "PROVIDER_RESPONDED", {
        providerRequestSent: result.evidence?.requestAttempted === true,
        providerResponseReceived: result.evidence?.responseReceived === true,
        billableRequestCount: result.evidence?.requestAttempted === true ? 1 : 0,
      }),
    );
    const requestIdHash = evidenceRequestHash(result);
    const usage = result.usage;
    if (
      !result.evidence?.requestAttempted ||
      !result.evidence.responseReceived ||
      !requestIdHash ||
      !usage
    ) {
      await budgetStore.markUnknownBillable({
        workspaceId,
        smokeRunId,
        budgetEpochId,
        reservationKey,
      });
    } else {
      try {
        await budgetStore.settle({
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey,
          providerRequestIdHash: requestIdHash,
          model: evidenceModel(result) ?? options.pricingPolicy.model,
          pricingVersion: options.pricingPolicy.pricingVersion,
          inputUnits: usage.inputUnits,
          cachedInputUnits: usage.cachedInputUnits ?? 0,
          outputUnits: usage.outputUnits,
          settledMicroUsd: calculateLiveSmokeCostMicroUsd(options.pricingPolicy, usage),
        });
      } catch {
        await budgetStore.markUnknownBillable({
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey,
        });
      }
    }
    const http200 = result.httpStatus === 200 || result.status === "COMPLETED";
    const strictOutputValid = result.status === "COMPLETED" && isCanaryOutput(result.outputJson);
    const domainValidationValid = strictOutputValid;
    const dispatchEvidenceComplete =
      result.evidence?.requestAttempted === true &&
      result.evidence.responseReceived === true &&
      evidenceRequestHash(result) !== undefined &&
      result.usage !== undefined;
    const passed =
      http200 &&
      result.model === "gpt-5.6-luna" &&
      strictOutputValid &&
      domainValidationValid &&
      dispatchEvidenceComplete;
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
