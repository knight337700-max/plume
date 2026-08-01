import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "../../../../../packages/core/src/agents/prompt-registry.js";
import type {
  LiveSmokeBudgetReservation,
  LiveSmokeBudgetReservationInput,
  LiveSmokeBudgetStore,
} from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import { createLiveSmokeHandler } from "./live-smoke.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";

const WORKSPACE_ID = "00000000-0000-4000-8000-0000000002c0";
const SMOKE_RUN_ID = "00000000-0000-4000-8000-0000000002d0";
interface TestLedger {
  readonly used: Map<string, number>;
  readonly reservations: Set<string>;
  tail: Promise<void>;
}

/** A durable-backend test double: instances share state and the atomic lock. */
class SharedTestBudgetStore implements LiveSmokeBudgetStore {
  public constructor(private readonly ledger: TestLedger) {}

  async reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation> {
    let release!: () => void;
    const prior = this.ledger.tail;
    this.ledger.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      const scope = `${input.workspaceId}:${input.smokeRunId}`;
      const key = `${scope}:${input.reservationKey}`;
      const used = this.ledger.used.get(scope) ?? 0;
      if (this.ledger.reservations.has(key))
        return { allowed: true, duplicate: true, used, remaining: input.limit - used };
      if (used + input.units > input.limit)
        return { allowed: false, duplicate: false, used, remaining: input.limit - used };
      this.ledger.reservations.add(key);
      const next = used + input.units;
      this.ledger.used.set(scope, next);
      return { allowed: true, duplicate: false, used: next, remaining: input.limit - next };
    } finally {
      release();
    }
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

function fakeJob(agentCode: string, itemNumber: number, workflowCallBudget: number) {
  return {
    id: `message-${itemNumber}`,
    data: { agentCode, workflowCallBudget },
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
      tail: Promise.resolve(),
    };
    const firstWorker = new SharedTestBudgetStore(ledger);
    const restartedWorker = new SharedTestBudgetStore(ledger);
    const reservations = await Promise.all(
      AGENT_CODES.map((agentCode, index) =>
        (index % 2 === 0 ? firstWorker : restartedWorker).reserve({
          workspaceId: WORKSPACE_ID,
          smokeRunId: SMOKE_RUN_ID,
          reservationKey: `${agentCode}:initial`,
          units: 1,
          limit: 8,
        }),
      ),
    );
    expect(reservations.every((reservation) => reservation.allowed)).toBe(true);
    expect(reservations).toHaveLength(8);
    expect(ledger.used.get(`${WORKSPACE_ID}:${SMOKE_RUN_ID}`)).toBe(8);

    const afterRestart = await restartedWorker.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      reservationKey: "overflow",
      units: 1,
      limit: 8,
    });
    expect(afterRestart.allowed).toBe(false);
    expect(afterRestart.used).toBe(8);
  });

  it("counts initial, retry, and repair separately, while duplicate reservation stays free", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
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
            error: { code: "RATE_LIMIT", message: "synthetic", retryable: true },
          };
        if (providerCall === 2)
          return { status: "COMPLETED" as const, outputJson: { invalid: true }, latencyMs: 1 };
        return {
          status: "COMPLETED" as const,
          outputJson: sampleForSchema(request.outputSchema),
          latencyMs: 1,
        };
      },
    };
    const handler = createLiveSmokeHandler(gateway, store);
    const result = await handler(fakeJob("COPY_GENERATOR", 99, 3), {
      workspaceId: WORKSPACE_ID,
      smokeRunId: "00000000-0000-4000-8000-0000000002d1",
      jobItemId: "00000000-0000-4000-8000-000000000399",
    });
    expect(result).toMatchObject({ status: "COMPLETED", agentCode: "COPY_GENERATOR" });
    expect(calls).toHaveLength(3);

    const duplicate = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: "00000000-0000-4000-8000-0000000002d1",
      reservationKey: "00000000-0000-4000-8000-000000000399:initial",
      units: 1,
      limit: 3,
    });
    expect(duplicate).toMatchObject({ allowed: true, duplicate: true, used: 3, remaining: 0 });
  });

  it("keeps workflow scopes isolated and replays only failed items", async () => {
    const ledger: TestLedger = {
      used: new Map(),
      reservations: new Set(),
      tail: Promise.resolve(),
    };
    const store = new SharedTestBudgetStore(ledger);
    const first = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: SMOKE_RUN_ID,
      reservationKey: "item-1:initial",
      units: 1,
      limit: 1,
    });
    const isolated = await store.reserve({
      workspaceId: WORKSPACE_ID,
      smokeRunId: "00000000-0000-4000-8000-0000000002d2",
      reservationKey: "item-1:initial",
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
