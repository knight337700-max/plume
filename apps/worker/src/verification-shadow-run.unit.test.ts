import { describe, expect, it } from "vitest";
import type {
  AsyncCommandPublisher,
  EnqueuedCommand,
} from "../../../packages/core/src/async/command-publisher.js";
import type { LiveSmokeBudgetStore } from "../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type {
  LiveSmokeCoverageStore,
  LiveSmokeVerificationRunInput,
  AgentLiveCoverageInput,
} from "../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import { createVerificationShadowRun, MOCK_ONLY_AGENT_CODES } from "./verification-shadow-run.js";
import { LIVE_SMOKE_SYNTHETIC_SCENARIO_ID } from "../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const UUIDS = {
  workspaceId: "00000000-0000-4000-8000-0000000002c0",
  parentWorkflowJobId: "00000000-0000-4000-8000-0000000002c7",
  verificationRunId: "00000000-0000-4000-8000-0000000002c8",
  smokeRunId: "00000000-0000-4000-8000-0000000002c9",
  budgetEpochId: "00000000-0000-4000-8000-0000000002ca",
} as const;

function fakes() {
  const commands: Array<{
    command: string;
    payload: unknown;
    jobId?: string;
    idempotencyKey?: string;
  }> = [];
  let runCreated = true;
  const publisher: AsyncCommandPublisher = {
    async enqueue(input) {
      commands.push({
        command: input.command,
        payload: input.payload,
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      });
      const jobId = input.jobId ?? UUIDS.verificationRunId;
      return {
        jobId,
        jobItemId: `${UUIDS.verificationRunId}-${commands.length}`,
        messageId: `00000000-0000-4000-8000-0000000002${10 + commands.length}`,
        status: "QUEUED",
        correlationId: jobId,
      } as EnqueuedCommand;
    },
  };
  const budgetStore: LiveSmokeBudgetStore = {
    async createEpoch(input) {
      return {
        ...input,
        parentBudgetEpochId: input.parentBudgetEpochId ?? null,
        used: 0,
        status: "OPEN",
      };
    },
    async reserve() {
      return { allowed: true, duplicate: false, used: 1, remaining: 7 };
    },
    async markDispatchStarted() {
      return { marked: true, duplicate: false };
    },
    async settle() {
      return { settled: true, duplicate: false };
    },
    async markUnknownBillable() {
      return { marked: true, duplicate: false };
    },
  };
  const coverageStore: LiveSmokeCoverageStore = {
    async createVerificationRun(input: LiveSmokeVerificationRunInput) {
      return { ...input, created: runCreated };
    },
    async recordCoverage(_input: AgentLiveCoverageInput) {
      return { inserted: true };
    },
    async listCoverage() {
      return [];
    },
  };
  return {
    commands,
    publisher,
    budgetStore,
    coverageStore,
    setRunCreated: (value: boolean) => (runCreated = value),
  };
}

describe("verification-only shadow queue", () => {
  it("creates exactly three isolated verify items and is idempotent", async () => {
    const fake = fakes();
    const input = {
      ...fake,
      workspaceId: UUIDS.workspaceId,
      parentWorkflowJobId: UUIDS.parentWorkflowJobId,
      idempotencyKey: "gate-h-2c6-shadow-test",
      environment: "staging" as const,
      syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      verificationRunId: UUIDS.verificationRunId,
      smokeRunId: UUIDS.smokeRunId,
      budgetEpochId: UUIDS.budgetEpochId,
    };
    const first = await createVerificationShadowRun(input);
    expect(first.created).toBe(true);
    expect(first.items).toHaveLength(3);
    expect(fake.commands).toHaveLength(3);
    expect(fake.commands.map((item) => (item.payload as { agentCode: string }).agentCode)).toEqual([
      ...MOCK_ONLY_AGENT_CODES,
    ]);
    expect(fake.commands.every((item) => item.command === "ai.live_smoke.verify")).toBe(true);
    expect(fake.commands.slice(1).every((item) => item.jobId === UUIDS.verificationRunId)).toBe(
      true,
    );

    fake.setRunCreated(false);
    const replay = await createVerificationShadowRun(input);
    expect(replay.created).toBe(false);
    expect(replay.items).toHaveLength(0);
    expect(fake.commands).toHaveLength(3);
  });

  it("refuses any non-staging environment", async () => {
    const fake = fakes();
    await expect(
      createVerificationShadowRun({
        ...fake,
        workspaceId: UUIDS.workspaceId,
        parentWorkflowJobId: UUIDS.parentWorkflowJobId,
        idempotencyKey: "gate-h-2c6-production-test",
        environment: "production" as never,
        syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      }),
    ).rejects.toThrow("VERIFICATION_SHADOW_STAGING_ONLY");
    expect(fake.commands).toHaveLength(0);
  });
});
