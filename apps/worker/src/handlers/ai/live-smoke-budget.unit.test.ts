import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "../../../../../packages/core/src/agents/prompt-registry.js";
import type {
  LiveSmokeBudgetReservation,
  LiveSmokeBudgetReservationInput,
  LiveSmokeBudgetStore,
} from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import { createLiveSmokeHandler } from "./live-smoke.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import { LIVE_SMOKE_SYNTHETIC_SCENARIO_ID } from "../../../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000002c0";
const SMOKE_RUN_ID = "00000000-0000-4000-8000-0000000002d0";
const BUDGET_EPOCH_ID = "00000000-0000-4000-8000-0000000002e0";
interface TestLedger {
  readonly used: Map<string, number>;
  readonly reservations: Set<string>;
  readonly epochs: Map<string, { limit: number; status: "OPEN" | "CLOSED_EXHAUSTED" | "CLOSED" }>;
  tail: Promise<void>;
}

/** A durable-backend test double: instances share state and the atomic lock. */
class SharedTestBudgetStore implements LiveSmokeBudgetStore {
  public constructor(private readonly ledger: TestLedger) {}

  async createEpoch(input: {
    workspaceId: string;
    smokeRunId: string;
    budgetEpochId: string;
    parentBudgetEpochId?: string | null;
    limit: number;
    reason: string;
  }) {
    const scope = `${input.workspaceId}:${input.smokeRunId}:${input.budgetEpochId}`;
    const existing = this.ledger.epochs.get(scope);
    if (existing && existing.limit !== input.limit) throw new Error("EPOCH_LIMIT_MISMATCH");
    if (!existing) this.ledger.epochs.set(scope, { limit: input.limit, status: "OPEN" });
    return {
      workspaceId: input.workspaceId,
      smokeRunId: input.smokeRunId,
      budgetEpochId: input.budgetEpochId,
      parentBudgetEpochId: input.parentBudgetEpochId ?? null,
      limit: input.limit,
      used: this.ledger.used.get(scope) ?? 0,
      status: this.ledger.epochs.get(scope)!.status,
    } as const;
  }

  async reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation> {
    if (input.providerMode === "mock")
      return { allowed: true, duplicate: false, used: 0, remaining: input.limit };
    let release!: () => void;
    const prior = this.ledger.tail;
    this.ledger.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      const scope = `${input.workspaceId}:${input.smokeRunId}:${input.budgetEpochId}`;
      if (!this.ledger.epochs.has(scope))
        this.ledger.epochs.set(scope, { limit: input.limit, status: "OPEN" });
      const key = `${scope}:${input.reservationKey}`;
      const used = this.ledger.used.get(scope) ?? 0;
      if (this.ledger.reservations.has(key))
        return { allowed: true, duplicate: true, used, remaining: input.limit - used };
      const epoch = this.ledger.epochs.get(scope)!;
      if (epoch.status !== "OPEN" || used + input.units > input.limit)
        return { allowed: false, duplicate: false, used, remaining: input.limit - used };
      this.ledger.reservations.add(key);
      const next = used + input.units;
      this.ledger.used.set(scope, next);
      if (next >= epoch.limit)
        this.ledger.epochs.set(scope, { ...epoch, status: "CLOSED_EXHAUSTED" });
      return { allowed: true, duplicate: false, used: next, remaining: input.limit - next };
    } finally {
      release();
    }
  }

  async markDispatchStarted() {
    return { marked: true, duplicate: false };
  }

  async settle() {
    return { settled: true, duplicate: false };
  }

  async markUnknownBillable() {
    return { marked: true, duplicate: false };
  }
}

function sampleForSchema(schema: JsonSchema): unknown {
  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf) && anyOf.length > 0) return sampleForSchema(anyOf[0]!);
  const enumValues = schema.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) return enumValues[0];
  const type = Array.isArray(schema.type)
    ? schema.type.find((value) => value !== "null")
    : schema.type;
  if (type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries(
      ((schema.required ?? []) as string[]).map((key) => [
        key,
        sampleForSchema(properties[key] ?? {}),
      ]),
    );
  }
  if (type === "array") return schema.items ? [sampleForSchema(schema.items)] : [];
  if (type === "integer" || type === "number") return 1;
  if (type === "boolean") return true;
  if (type === "null") return null;
  return "synthetic";
}

function fakeJob(
  agentCode: string,
  itemNumber: number,
  workflowCallBudget: number,
  attemptsMade = 0,
  scope: { readonly smokeRunId?: string; readonly budgetEpochId?: string } = {},
) {
  return {
    id: `message-${itemNumber}`,
    attemptsMade,
    data: {
      agentCode,
      syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      ...(scope.smokeRunId ? { smokeRunId: scope.smokeRunId } : {}),
      budgetEpochId: scope.budgetEpochId ?? BUDGET_EPOCH_ID,
      workflowCallBudget,
    },
  } as never;
}

describe("live smoke workflow budget", () => {
  it("reproduces the old shared Worker counter: five pass and the last three are blocked", () => {
    let requestCount = 0;
    const legacyResults = Array.from({ length: 8 }, () => {
      if (requestCount >= 5) return false;
      requestCount += 1;
      return true;
    });
    expect(legacyResults.filter(Boolean)).toHaveLength(5);
    expect(legacyResults.slice(5)).toEqual([false, false, false]);
  });

  it("allows all eight items with one shared durable workflow budget and no process counter", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
      epochs: new Map(),
      tail: Promise.resolve(),
    };
    const firstWorker = new SharedTestBudgetStore(ledger);
    const restartedWorker = new SharedTestBudgetStore(ledger);
    const reservations = await Promise.all(
      AGENT_CODES.map((agentCode, index) =>
        (index % 2 === 0 ? firstWorker : restartedWorker).reserve({
          workspaceId: WORKSPACE_ID,
          smokeRunId: SMOKE_RUN_ID,
          budgetEpochId: BUDGET_EPOCH_ID,
          reservationKey: `${agentCode}:initial`,
          providerMode: "live",
          units: 1,
          limit: 8,
        }),
      ),
    );
    expect(reservations.every((reservation) => reservation.allowed)).toBe(true);
    expect(reservations).toHaveLength(8);
    expect(ledger.used.get(`${WORKSPACE_ID}:${SMOKE_RUN_ID}:${BUDGET_EPOCH_ID}`)).toBe(8);

    const afterRestart = await restartedWorker.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      budgetEpochId: BUDGET_EPOCH_ID,
      reservationKey: "overflow",
      providerMode: "live",
      units: 1,
      limit: 8,
    });
    expect(afterRestart.allowed).toBe(false);
    expect(afterRestart.used).toBe(8);
  });

  it("keeps the exhausted Phase 2C.4 epoch immutable and isolates a new epoch", async () => {
    const ledger: TestLedger = {
      used: new Map([[`${WORKSPACE_ID}:${SMOKE_RUN_ID}:00000000-0000-4000-8000-0000000002e4`, 20]]),
      reservations: new Set(),
      epochs: new Map([
        [
          `${WORKSPACE_ID}:${SMOKE_RUN_ID}:00000000-0000-4000-8000-0000000002e4`,
          { limit: 20, status: "CLOSED_EXHAUSTED" },
        ],
      ]),
      tail: Promise.resolve(),
    };
    const oldEpoch = new SharedTestBudgetStore(ledger);
    const old = await oldEpoch.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      budgetEpochId: "00000000-0000-4000-8000-0000000002e4",
      reservationKey: "old-overflow",
      providerMode: "live",
      units: 1,
      limit: 20,
    });
    expect(old).toMatchObject({ allowed: false, used: 20, remaining: 0 });

    const newEpochId = "00000000-0000-4000-8000-0000000002e5";
    await oldEpoch.createEpoch({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      budgetEpochId: newEpochId,
      parentBudgetEpochId: "00000000-0000-4000-8000-0000000002e4",
      limit: 12,
      reason: "phase2c5-failed-item-resume",
    });
    const restarted = new SharedTestBudgetStore(ledger);
    const allowed = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        restarted.reserve({
          workspaceId: WORKSPACE_ID,
          smokeRunId: SMOKE_RUN_ID,
          budgetEpochId: newEpochId,
          reservationKey: `failed-${index}:initial`,
          providerMode: "live",
          units: 1,
          limit: 12,
        }),
      ),
    );
    expect(allowed.every((reservation) => reservation.allowed)).toBe(true);
    await expect(
      restarted.reserve({
        workspaceId: WORKSPACE_ID,
        smokeRunId: SMOKE_RUN_ID,
        budgetEpochId: newEpochId,
        reservationKey: "thirteenth",
        providerMode: "live",
        units: 1,
        limit: 12,
      }),
    ).resolves.toMatchObject({ allowed: false, used: 12, remaining: 0 });
    expect(
      ledger.used.get(`${WORKSPACE_ID}:${SMOKE_RUN_ID}:00000000-0000-4000-8000-0000000002e4`),
    ).toBe(20);
    expect(ledger.used.get(`${WORKSPACE_ID}:${SMOKE_RUN_ID}:${newEpochId}`)).toBe(12);
  });

  it("counts initial, retry, and repair separately, while duplicate reservation stays free", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
      epochs: new Map(),
      tail: Promise.resolve(),
    };
    const store = new SharedTestBudgetStore(ledger);
    const calls: unknown[] = [];
    let providerCall = 0;
    const gateway = {
      async execute(request: { outputSchema: JsonSchema }) {
        providerCall += 1;
        calls.push(request);
        if (providerCall === 1)
          return {
            status: "FAILED" as const,
            latencyMs: 1,
            model: "gpt-5.6-luna",
            usage: { inputUnits: 1, outputUnits: 1 },
            providerRequestIdHash: "1".repeat(64),
            evidence: {
              requestAttempted: true,
              responseReceived: true,
              httpStatus: 429,
              requestIdHash: "1".repeat(64),
              resolvedModel: "gpt-5.6-luna",
              jsonParseStatus: "NOT_REACHED" as const,
            },
            error: { code: "RATE_LIMIT", message: "synthetic", retryable: true },
          };
        if (providerCall === 2)
          return {
            status: "COMPLETED" as const,
            model: "gpt-5.6-luna",
            outputJson: { invalid: true },
            latencyMs: 1,
            usage: { inputUnits: 1, outputUnits: 1 },
            providerRequestIdHash: "2".repeat(64),
            evidence: {
              requestAttempted: true,
              responseReceived: true,
              httpStatus: 200,
              requestIdHash: "2".repeat(64),
              resolvedModel: "gpt-5.6-luna",
              jsonParseStatus: "PASS" as const,
            },
          };
        return {
          status: "COMPLETED" as const,
          model: "gpt-5.6-luna",
          outputJson: sampleForSchema(request.outputSchema),
          latencyMs: 1,
          usage: { inputUnits: 1, outputUnits: 1 },
          providerRequestIdHash: "3".repeat(64),
          evidence: {
            requestAttempted: true,
            responseReceived: true,
            httpStatus: 200,
            requestIdHash: "3".repeat(64),
            resolvedModel: "gpt-5.6-luna",
            jsonParseStatus: "PASS" as const,
          },
        };
      },
    };
    const handler = createLiveSmokeHandler(gateway, store, {
      providerMode: "live",
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    const result = await handler(
      fakeJob("COPY_GENERATOR", 99, 3, 0, {
        smokeRunId: "00000000-0000-4000-8000-0000000002d1",
        budgetEpochId: "00000000-0000-4000-8000-0000000002e1",
      }),
      {
        workspaceId: WORKSPACE_ID,
        smokeRunId: "00000000-0000-4000-8000-0000000002d1",
        budgetEpochId: "00000000-0000-4000-8000-0000000002e1",
        jobItemId: "00000000-0000-4000-8000-000000000399",
      },
    );
    expect(result).toMatchObject({ status: "COMPLETED", agentCode: "COPY_GENERATOR" });
    expect(calls).toHaveLength(3);

    const duplicate = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: "00000000-0000-4000-8000-0000000002d1",
      budgetEpochId: "00000000-0000-4000-8000-0000000002e1",
      reservationKey:
        "00000000-0000-4000-8000-0000000002e1:00000000-0000-4000-8000-000000000399:delivery:0:initial",
      providerMode: "live",
      units: 1,
      limit: 3,
    });
    expect(duplicate).toMatchObject({ allowed: true, duplicate: true, used: 3, remaining: 0 });
  });

  it("uses a distinct durable retry scope for a BullMQ delivery retry", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
      epochs: new Map(),
      tail: Promise.resolve(),
    };
    const store = new SharedTestBudgetStore(ledger);
    let providerCall = 0;
    const gateway = {
      async execute(request: { outputSchema: JsonSchema }) {
        providerCall += 1;
        if (providerCall <= 2) {
          return {
            status: "FAILED" as const,
            model: "gpt-5.6-luna",
            latencyMs: 1,
            usage: { inputUnits: 1, outputUnits: 1 },
            providerRequestIdHash: `${providerCall}`.repeat(64),
            evidence: {
              requestAttempted: true,
              responseReceived: true,
              httpStatus: 503,
              requestIdHash: `${providerCall}`.repeat(64),
              resolvedModel: "gpt-5.6-luna",
              jsonParseStatus: "NOT_REACHED" as const,
            },
            error: { code: "TRANSIENT_PROVIDER_ERROR", message: "synthetic", retryable: true },
          };
        }
        return {
          status: "COMPLETED" as const,
          model: "gpt-5.6-luna",
          outputJson: sampleForSchema(request.outputSchema),
          latencyMs: 1,
          usage: { inputUnits: 1, outputUnits: 1 },
          providerRequestIdHash: "3".repeat(64),
          evidence: {
            requestAttempted: true,
            responseReceived: true,
            httpStatus: 200,
            requestIdHash: "3".repeat(64),
            resolvedModel: "gpt-5.6-luna",
            jsonParseStatus: "PASS" as const,
          },
        };
      },
    };
    const handler = createLiveSmokeHandler(gateway, store, {
      providerMode: "live",
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
    });
    await expect(
      handler(
        fakeJob("COPY_GENERATOR", 100, 3, 0, {
          smokeRunId: "00000000-0000-4000-8000-0000000002d3",
          budgetEpochId: "00000000-0000-4000-8000-0000000002e3",
        }),
        {
          workspaceId: WORKSPACE_ID,
          smokeRunId: "00000000-0000-4000-8000-0000000002d3",
          budgetEpochId: "00000000-0000-4000-8000-0000000002e3",
          jobItemId: "00000000-0000-4000-8000-000000000400",
        },
      ),
    ).rejects.toThrow("AI_LIVE_SMOKE_AGENT_FAILED");
    const resumed = await handler(
      fakeJob("COPY_GENERATOR", 100, 3, 1, {
        smokeRunId: "00000000-0000-4000-8000-0000000002d3",
        budgetEpochId: "00000000-0000-4000-8000-0000000002e3",
      }),
      {
        workspaceId: WORKSPACE_ID,
        smokeRunId: "00000000-0000-4000-8000-0000000002d3",
        budgetEpochId: "00000000-0000-4000-8000-0000000002e3",
        jobItemId: "00000000-0000-4000-8000-000000000400",
      },
    );
    expect(resumed).toMatchObject({ status: "COMPLETED", agentCode: "COPY_GENERATOR" });
    expect(providerCall).toBe(3);
    expect(
      ledger.used.get(
        `${WORKSPACE_ID}:00000000-0000-4000-8000-0000000002d3:00000000-0000-4000-8000-0000000002e3`,
      ),
    ).toBe(3);
  });

  it("keeps workflow scopes isolated and replays only failed items", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
      epochs: new Map(),
      tail: Promise.resolve(),
    };
    const store = new SharedTestBudgetStore(ledger);
    const first = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      budgetEpochId: BUDGET_EPOCH_ID,
      reservationKey: "item-1:initial",
      providerMode: "live",
      units: 1,
      limit: 1,
    });
    const isolated = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: "00000000-0000-4000-8000-0000000002d2",
      budgetEpochId: "00000000-0000-4000-8000-0000000002e2",
      reservationKey: "item-1:initial",
      providerMode: "live",
      units: 1,
      limit: 1,
    });
    expect(first.allowed).toBe(true);
    expect(isolated.allowed).toBe(true);

    const items = [
      ...Array.from({ length: 5 }, (_, index) => ({
        itemKey: `success-${index}`,
        status: "COMPLETED",
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        itemKey: `failed-${index}`,
        status: "FAILED",
      })),
    ];
    expect(items.filter((item) => item.status === "FAILED")).toHaveLength(3);
    expect(items.filter((item) => item.status === "COMPLETED")).toHaveLength(5);
  });
});
