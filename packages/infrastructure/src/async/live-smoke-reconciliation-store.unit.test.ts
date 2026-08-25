import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { PostgresLiveSmokeReconciliationStore } from "./live-smoke-reconciliation-store.js";

function fakeSql(rows: readonly Record<string, unknown>[]): Sql {
  const query = (() => Promise.resolve(rows)) as unknown as Sql;
  return query;
}

const adjustment = {
  adjustmentKey: "PLUME-GATE-I-2.5C-B-54DF7982-20260804-R3:UNKNOWN_BILLABLE_CARRY_FORWARD",
  billingScope: "plume-controlled-live-qa",
  billingPeriodUtc: "2026-08-01",
  sourceApprovalId: "PLUME-GATE-I-2.5C-B-54DF7982-20260804-R3",
  reasonCode: "UNKNOWN_BILLABLE_CARRY_FORWARD" as const,
  conservativeMicroUsd: 1_500_000,
  representsActualCost: false as const,
};

describe("R3 conservative reconciliation carry-forward", () => {
  it("is idempotent and retains the non-actual-cost marker", async () => {
    const first = new PostgresLiveSmokeReconciliationStore(fakeSql([{ adjustment_key: "key" }]));
    const duplicate = new PostgresLiveSmokeReconciliationStore(fakeSql([]));

    await expect(first.insertAdjustment(adjustment)).resolves.toEqual({
      inserted: true,
      duplicate: false,
    });
    await expect(duplicate.insertAdjustment(adjustment)).resolves.toEqual({
      inserted: false,
      duplicate: true,
    });
  });

  it("rejects negative or non-actual-cost values before SQL", async () => {
    const store = new PostgresLiveSmokeReconciliationStore(fakeSql([]));
    await expect(
      store.insertAdjustment({ ...adjustment, conservativeMicroUsd: -1 }),
    ).rejects.toThrow("LIVE_SMOKE_RECONCILIATION_AMOUNT_INVALID");
    await expect(
      store.insertAdjustment({ ...adjustment, representsActualCost: true }),
    ).rejects.toThrow("LIVE_SMOKE_RECONCILIATION_ACTUAL_COST_FORBIDDEN");
  });

  it("reads carry-forward as monthly exposure without changing per-run limits", async () => {
    const store = new PostgresLiveSmokeReconciliationStore(fakeSql([{ total: 1_500_000 }]));
    await expect(
      store.monthlyConservativeExposure({
        billingScope: adjustment.billingScope,
        billingPeriodUtc: adjustment.billingPeriodUtc,
      }),
    ).resolves.toBe(1_500_000);
  });
});
