import { randomUUID } from "node:crypto";
import type { AgentCode } from "../../../packages/core/src/agents/prompt-registry.js";
import type {
  AsyncCommandPublisher,
  EnqueuedCommand,
} from "../../../packages/core/src/async/command-publisher.js";
import type { AiLiveSmokeVerificationPayload } from "../../../packages/contracts/src/async.js";
import type { LiveSmokeBudgetStore } from "../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";

export const MOCK_ONLY_AGENT_CODES = Object.freeze([
  "LAYOUT_PLANNER",
  "ASSET_CURATOR",
  "EXPORT_ASSISTANT",
] as const satisfies readonly AgentCode[]);

export interface CreateVerificationShadowRunInput {
  readonly publisher: AsyncCommandPublisher;
  readonly budgetStore: LiveSmokeBudgetStore;
  readonly coverageStore: LiveSmokeCoverageStore;
  readonly workspaceId: string;
  readonly parentWorkflowJobId: string;
  readonly idempotencyKey: string;
  readonly environment: "staging";
  readonly verificationRunId?: string;
  readonly smokeRunId?: string;
  readonly budgetEpochId?: string;
  readonly budgetLimit?: number;
  readonly retryEnabled?: boolean;
  readonly repairEnabled?: boolean;
}

export interface VerificationShadowRun {
  readonly verificationRunId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentWorkflowJobId: string;
  readonly created: boolean;
  readonly items: readonly EnqueuedCommand[];
}

/** Creates exactly one isolated verification item per Mock-only agent. */
export async function createVerificationShadowRun(
  input: CreateVerificationShadowRunInput,
): Promise<VerificationShadowRun> {
  if (input.environment !== "staging") throw new Error("VERIFICATION_SHADOW_STAGING_ONLY");
  const verificationRunId = input.verificationRunId ?? randomUUID();
  const smokeRunId = input.smokeRunId ?? randomUUID();
  const budgetEpochId = input.budgetEpochId ?? randomUUID();
  const epoch = await input.budgetStore.createEpoch({
    workspaceId: input.workspaceId,
    smokeRunId,
    budgetEpochId,
    parentBudgetEpochId: null,
    limit: input.budgetLimit ?? 8,
    reason:
      input.budgetLimit === undefined
        ? "GATE_H_PHASE_2C6_VERIFICATION_ONLY_SHADOW_QUEUE"
        : "GATE_H_PHASE_2C9_DIAGNOSTIC_SCHEMA_EVIDENCE",
  });
  if (epoch.limit !== (input.budgetLimit ?? 8))
    throw new Error("VERIFICATION_SHADOW_BUDGET_LIMIT_MISMATCH");
  const run = await input.coverageStore.createVerificationRun({
    verificationRunId,
    workspaceId: input.workspaceId,
    smokeRunId,
    budgetEpochId,
    parentWorkflowJobId: input.parentWorkflowJobId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!run.created)
    return {
      verificationRunId,
      smokeRunId,
      budgetEpochId,
      parentWorkflowJobId: input.parentWorkflowJobId,
      created: false,
      items: [],
    };

  const payload = (agentCode: AgentCode): AiLiveSmokeVerificationPayload => ({
    verificationRunId,
    parentWorkflowJobId: input.parentWorkflowJobId,
    agentCode,
    workspaceId: input.workspaceId,
    smokeRunId,
    budgetEpochId,
    workflowCallBudget: input.budgetLimit ?? 8,
    ...(input.retryEnabled === undefined ? {} : { retryEnabled: input.retryEnabled }),
    ...(input.repairEnabled === undefined ? {} : { repairEnabled: input.repairEnabled }),
    verificationOnly: true,
  });
  const first = await input.publisher.enqueue({
    workspaceId: input.workspaceId,
    command: "ai.live_smoke.verify",
    schemaVersion: 1,
    payload: payload(MOCK_ONLY_AGENT_CODES[0]),
    idempotencyKey: input.idempotencyKey,
  });
  const items: EnqueuedCommand[] = [first];
  for (const agentCode of MOCK_ONLY_AGENT_CODES.slice(1)) {
    items.push(
      await input.publisher.enqueue({
        workspaceId: input.workspaceId,
        command: "ai.live_smoke.verify",
        schemaVersion: 1,
        jobId: first.jobId,
        correlationId: first.correlationId,
        causationId: first.messageId,
        payload: payload(agentCode),
      }),
    );
  }
  return {
    verificationRunId,
    smokeRunId,
    budgetEpochId,
    parentWorkflowJobId: input.parentWorkflowJobId,
    created: true,
    items: Object.freeze(items),
  };
}
