import { describe, expect, it } from "vitest";
import {
  createLiveSmokeHandler,
  createLiveSmokeProviderCanaryHandler,
  createLiveSmokeVerificationHandler,
} from "./live-smoke.js";
import type { AgentProviderGateway } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { LiveSmokeBudgetStore } from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import type {
  LiveSmokeLifecycleStore,
  LiveSmokeReservationLifecycleInput,
} from "../../../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";

const ids = {
  workspaceId: "00000000-0000-4000-8000-0000000002c0",
  smokeRunId: "00000000-0000-4000-8000-0000000002c7",
  budgetEpochId: "00000000-0000-4000-8000-0000000002d7",
  verificationRunId: "00000000-0000-4000-8000-0000000002e7",
  jobItemId: "00000000-0000-4000-8000-0000000002f7",
};

class FakeBudgetStore implements LiveSmokeBudgetStore {
  public reservations = new Set<string>();
  public released: string[] = [];
  public events: string[] = [];
  public unknownBillable = 0;

  async createEpoch() {
    return {
      ...ids,
      parentBudgetEpochId: null,
      limit: 7,
      used: 0,
      status: "OPEN" as const,
    };
  }

  async reserve(input: { reservationKey: string; providerMode: "mock" | "live"; limit: number }) {
    this.events.push("reserve");
    if (input.providerMode === "mock")
      return { allowed: true, duplicate: false, used: 0, remaining: input.limit };
    if (this.reservations.has(input.reservationKey))
      return { allowed: true, duplicate: true, used: 1, remaining: input.limit - 1 };
    this.reservations.add(input.reservationKey);
    return { allowed: true, duplicate: false, used: 1, remaining: input.limit - 1 };
  }

  async markDispatchStarted() {
    this.events.push("dispatch-started");
    return { marked: true, duplicate: false };
  }

  async settle() {
    return { settled: true, duplicate: false };
  }

  async markUnknownBillable() {
    this.unknownBillable += 1;
    return { marked: true, duplicate: false };
  }

  async releasePreDispatch(input: { reservationKey: string }) {
    this.released.push(input.reservationKey);
    this.reservations.delete(input.reservationKey);
    return { released: true, used: 0, remaining: 7 };
  }
}

class FakeLifecycleStore implements LiveSmokeLifecycleStore {
  public events: LiveSmokeReservationLifecycleInput[] = [];
  public canaryStatus: "PENDING" | "PASS" | "FAIL" = "PENDING";
  public canaryResults: unknown[] = [];
  public throwOnDispatch = false;

  async record(input: LiveSmokeReservationLifecycleInput) {
    if (this.throwOnDispatch && input.lifecycleState === "DISPATCH_STARTED")
      throw new Error("PRE_DISPATCH_VALIDATION_FAILED");
    this.events.push(input);
    return { inserted: true };
  }

  async markProviderRequestAttempt() {
    return { updated: true };
  }

  async recordReconciliation() {
    return { inserted: true };
  }

  async ensureCanary() {}

  async getCanaryStatus() {
    return this.canaryStatus;
  }

  async recordCanary(input: unknown) {
    this.canaryResults.push(input);
    this.canaryStatus = (input as { passed: boolean }).passed ? "PASS" : "FAIL";
  }
}

const fakeJob = (agentCode = "COPY_GENERATOR") =>
  ({
    id: ids.jobItemId,
    attemptsMade: 0,
    data: { agentCode, budgetEpochId: ids.budgetEpochId, workflowCallBudget: 7 },
  }) as never;

const successGateway = (): { gateway: AgentProviderGateway; calls: number } => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    gateway: {
      async execute(request) {
        calls += 1;
        await request.onSdkRequestAttempt?.();
        if (request.metadata.agentCode === "PROVIDER_ACCESSIBILITY_CANARY")
          return {
            status: "COMPLETED",
            model: "gpt-5.6-luna",
            httpStatus: 200,
            outputJson: { status: "ok", environment: "staging", provider: "openai" },
            latencyMs: 1,
            usage: { inputUnits: 1, outputUnits: 1 },
            providerRequestIdHash: "a".repeat(64),
            evidence: {
              requestAttempted: true,
              responseReceived: true,
              httpStatus: 200,
              requestIdHash: "a".repeat(64),
              resolvedModel: "gpt-5.6-luna",
              jsonParseStatus: "PASS" as const,
            },
          };
        return {
          status: "COMPLETED",
          model: "gpt-5.6-luna",
          outputJson: { variants: [] },
          latencyMs: 1,
          usage: { inputUnits: 1, outputUnits: 1 },
          providerRequestIdHash: "b".repeat(64),
          evidence: {
            requestAttempted: true,
            responseReceived: true,
            httpStatus: 200,
            requestIdHash: "b".repeat(64),
            resolvedModel: "gpt-5.6-luna",
            jsonParseStatus: "PASS" as const,
          },
        };
      },
    },
  };
};

const emptyCoverageStore: LiveSmokeCoverageStore = {
  async createVerificationRun(input) {
    return { ...input, created: true };
  },
  async recordCoverage() {
    return { inserted: true };
  },
  async listCoverage() {
    return [];
  },
};

describe("Phase 2C.7 provider lifecycle", () => {
  it("records RESERVED, DISPATCH_STARTED, and PROVIDER_RESPONDED for a live call", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    const provider = successGateway();
    const handler = createLiveSmokeHandler(provider.gateway, budget, {
      providerMode: "live",
      lifecycleStore: lifecycle,
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    await handler(fakeJob(), ids);
    expect(provider.calls).toBe(1);
    expect(budget.events).toEqual(["reserve", "dispatch-started"]);
    expect(lifecycle.events.map((event) => event.lifecycleState)).toEqual([
      "RESERVED",
      "DISPATCH_STARTED",
      "PROVIDER_RESPONDED",
    ]);
    expect(lifecycle.events.at(-1)?.billableRequestCount).toBe(1);
  });

  it("releases capacity and records zero billable usage before dispatch", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    lifecycle.throwOnDispatch = true;
    const provider = successGateway();
    const handler = createLiveSmokeHandler(provider.gateway, budget, {
      providerMode: "live",
      lifecycleStore: lifecycle,
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    await expect(handler(fakeJob(), ids)).rejects.toThrow("PRE_DISPATCH_VALIDATION_FAILED");
    expect(provider.calls).toBe(0);
    expect(budget.released).toHaveLength(1);
    expect(lifecycle.events.map((event) => event.lifecycleState)).toEqual([
      "RESERVED",
      "RELEASED_PRE_DISPATCH",
    ]);
    expect(lifecycle.events.at(-1)?.billableRequestCount).toBe(0);
  });

  it("opens the SDK boundary only after the durable dispatch marker", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    const provider = successGateway();
    const handler = createLiveSmokeHandler(provider.gateway, budget, {
      providerMode: "live",
      lifecycleStore: lifecycle,
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    await handler(fakeJob(), ids);
    expect(budget.events).toEqual(["reserve", "dispatch-started"]);
    expect(provider.calls).toBe(1);
  });

  it("keeps uncertain post-dispatch failures billable and disables automatic retry", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    let calls = 0;
    const handler = createLiveSmokeHandler(
      {
        async execute(request) {
          calls += 1;
          await request.onSdkRequestAttempt?.();
          return {
            status: "FAILED" as const,
            model: "gpt-5.6-luna",
            latencyMs: 1,
            error: { code: "TIMEOUT", message: "synthetic", retryable: true },
            evidence: {
              requestAttempted: true,
              responseReceived: false,
              resolvedModel: "gpt-5.6-luna",
              jsonParseStatus: "NOT_REACHED" as const,
            },
          };
        },
      },
      budget,
      {
        providerMode: "live",
        lifecycleStore: lifecycle,
        pricingPolicy: {
          model: "gpt-5.6-luna",
          pricingVersion: "test",
          inputMicroUsdPerMillionTokens: 1,
          outputMicroUsdPerMillionTokens: 1,
        },
      },
    );
    await expect(handler(fakeJob(), ids)).rejects.toThrow("LIVE_SMOKE_UNKNOWN_BILLABLE");
    expect(calls).toBe(1);
    expect(budget.unknownBillable).toBe(1);
  });

  it("blocks verification items until the single canary passes", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    const provider = successGateway();
    const handler = createLiveSmokeVerificationHandler(
      provider.gateway,
      budget,
      emptyCoverageStore,
      {
        providerMode: "live",
        lifecycleStore: lifecycle,
        pricingPolicy: {
          model: "gpt-5.6-luna",
          pricingVersion: "test",
          inputMicroUsdPerMillionTokens: 1,
          outputMicroUsdPerMillionTokens: 1,
        },
      },
    );
    await expect(
      handler(
        {
          id: ids.jobItemId,
          attemptsMade: 0,
          data: {
            verificationOnly: true,
            verificationRunId: ids.verificationRunId,
            parentWorkflowJobId: ids.smokeRunId,
            agentCode: "LAYOUT_PLANNER",
            workspaceId: ids.workspaceId,
            smokeRunId: ids.smokeRunId,
            budgetEpochId: ids.budgetEpochId,
            workflowCallBudget: 7,
          },
        } as never,
        ids,
      ),
    ).rejects.toThrow("LIVE_SMOKE_PROVIDER_CANARY_REQUIRED");
    expect(provider.calls).toBe(0);
  });

  it("requires the exact model and strict/domain canary output", async () => {
    const budget = new FakeBudgetStore();
    const lifecycle = new FakeLifecycleStore();
    const provider = successGateway();
    const handler = createLiveSmokeProviderCanaryHandler(provider.gateway, budget, lifecycle, {
      providerMode: "live",
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    await handler(
      {
        id: ids.jobItemId,
        attemptsMade: 0,
        data: {
          canary: true,
          verificationRunId: ids.verificationRunId,
          parentWorkflowJobId: ids.smokeRunId,
          workspaceId: ids.workspaceId,
          smokeRunId: ids.smokeRunId,
          budgetEpochId: ids.budgetEpochId,
          workflowCallBudget: 7,
        },
      } as never,
      ids,
    );
    expect(provider.calls).toBe(1);
    expect(lifecycle.canaryStatus).toBe("PASS");
    expect(lifecycle.canaryResults).toHaveLength(1);
  });
});
