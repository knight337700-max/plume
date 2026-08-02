import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresLiveSmokeBudgetStore,
  type LiveSmokeBudgetStore,
} from "./live-smoke-budget-store.js";

const enabled = process.env.RUN_LIVE_SMOKE_BUDGET_DB_TEST === "true";
const workspaceId = "00000000-0000-4000-8000-0000000002e0";
const smokeRunId = "00000000-0000-4000-8000-0000000002e1";
const budgetEpochId = "00000000-0000-4000-8000-0000000002e2";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const sql = postgres(databaseUrl, { max: 4 });

describe.skipIf(!enabled)("postgres live smoke budget store", () => {
  beforeAll(async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS live_smoke_budget_ledger (
        workspace_id uuid NOT NULL,
        smoke_run_id uuid NOT NULL,
        call_limit integer NOT NULL CHECK (call_limit BETWEEN 1 AND 20),
        used_units integer NOT NULL DEFAULT 0 CHECK (used_units >= 0 AND used_units <= call_limit),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, smoke_run_id)
      );
      CREATE TABLE IF NOT EXISTS live_smoke_budget_reservation (
        workspace_id uuid NOT NULL,
        smoke_run_id uuid NOT NULL,
        reservation_key varchar(250) NOT NULL,
        units integer NOT NULL CHECK (units > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, smoke_run_id, reservation_key),
        FOREIGN KEY (workspace_id, smoke_run_id)
          REFERENCES live_smoke_budget_ledger (workspace_id, smoke_run_id)
          ON DELETE CASCADE
      );
    `);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS live_smoke_budget_epoch (
        workspace_id uuid NOT NULL,
        smoke_run_id uuid NOT NULL,
        budget_epoch_id uuid NOT NULL,
        parent_budget_epoch_id uuid,
        call_limit integer NOT NULL,
        used_units integer NOT NULL DEFAULT 0,
        status varchar(30) NOT NULL DEFAULT 'OPEN',
        reason varchar(250) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id)
      );
      CREATE TABLE IF NOT EXISTS live_smoke_budget_epoch_reservation (
        workspace_id uuid NOT NULL,
        smoke_run_id uuid NOT NULL,
        budget_epoch_id uuid NOT NULL,
        reservation_key varchar(250) NOT NULL,
        units integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id, reservation_key)
      );
    `);
    await new PostgresLiveSmokeBudgetStore(sql).createEpoch({
      workspaceId,
      smokeRunId,
      budgetEpochId,
      limit: 20,
      reason: "integration-test",
    });
  });

  afterAll(async () => {
    await sql`
      DELETE FROM live_smoke_spend_ledger
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql`
      DELETE FROM live_smoke_budget_epoch_reservation
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql`
      DELETE FROM live_smoke_budget_epoch
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql.end({ timeout: 5 });
  });

  it("is atomic across workers, restart-safe, and duplicate-safe", async () => {
    const workers: readonly LiveSmokeBudgetStore[] = [
      new PostgresLiveSmokeBudgetStore(sql),
      new PostgresLiveSmokeBudgetStore(sql),
    ];
    const reservations = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        workers[index % workers.length]!.reserve({
          workspaceId,
          smokeRunId,
          budgetEpochId,
          reservationKey: `item-${index}:initial`,
          providerMode: "live",
          units: 1,
          limit: 20,
        }),
      ),
    );
    expect(reservations.every((reservation) => reservation.allowed)).toBe(true);
    const overflow = await new PostgresLiveSmokeBudgetStore(sql).reserve({
      workspaceId,
      smokeRunId,
      budgetEpochId,
      reservationKey: "overflow:initial",
      providerMode: "live",
      units: 1,
      limit: 20,
    });
    expect(overflow).toMatchObject({ allowed: false, used: 20, remaining: 0 });
    const duplicateInput = {
      workspaceId,
      smokeRunId,
      budgetEpochId,
      reservationKey: "item-0:initial",
      providerMode: "live",
      units: 1,
      limit: 20,
    } as const;
    const firstDuplicate = await new PostgresLiveSmokeBudgetStore(sql).reserve(duplicateInput);
    const secondDuplicate = await new PostgresLiveSmokeBudgetStore(sql).reserve(duplicateInput);
    expect(firstDuplicate).toMatchObject({
      allowed: true,
      duplicate: true,
      used: 20,
      remaining: 0,
    });
    expect(secondDuplicate).toEqual(firstDuplicate);

    const reservationRows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM live_smoke_budget_epoch_reservation
      WHERE workspace_id = ${workspaceId}
        AND smoke_run_id = ${smokeRunId}
        AND budget_epoch_id = ${budgetEpochId}
    `;
    expect(reservationRows[0]?.count).toBe(20);

    const dedupeEpochId = "00000000-0000-4000-8000-0000000003d1";
    await new PostgresLiveSmokeBudgetStore(sql).createEpoch({
      workspaceId,
      smokeRunId,
      budgetEpochId: dedupeEpochId,
      limit: 20,
      reason: "same-idempotency-concurrency",
    });
    const duplicateReservations = await Promise.all(
      Array.from({ length: 20 }, () =>
        new PostgresLiveSmokeBudgetStore(sql).reserve({
          workspaceId,
          smokeRunId,
          budgetEpochId: dedupeEpochId,
          reservationKey: "same-idempotency-key",
          providerMode: "live",
          units: 1,
          limit: 20,
          reservedMicroUsd: 100,
          model: "gpt-5.6-luna",
          pricingVersion: "test-v1",
        }),
      ),
    );
    expect(duplicateReservations.filter((reservation) => reservation.allowed)).toHaveLength(20);
    expect(duplicateReservations.filter((reservation) => reservation.duplicate)).toHaveLength(19);
    const duplicateRows = await sql<{ count: number; used: number }[]>`
      SELECT
        (SELECT count(*)::int FROM live_smoke_budget_epoch_reservation
         WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
           AND budget_epoch_id = ${dedupeEpochId}) AS count,
        (SELECT used_units FROM live_smoke_budget_epoch
         WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
           AND budget_epoch_id = ${dedupeEpochId}) AS used
    `;
    expect(duplicateRows[0]).toEqual({ count: 1, used: 1 });

    const settlementEpochId = "00000000-0000-4000-8000-0000000003d2";
    const settlementStore = new PostgresLiveSmokeBudgetStore(sql);
    await settlementStore.createEpoch({
      workspaceId,
      smokeRunId,
      budgetEpochId: settlementEpochId,
      limit: 3,
      reason: "settlement-once",
    });
    await settlementStore.reserve({
      workspaceId,
      smokeRunId,
      budgetEpochId: settlementEpochId,
      reservationKey: "settlement-key",
      providerMode: "live",
      units: 1,
      limit: 3,
      reservedMicroUsd: 100,
      model: "gpt-5.6-luna",
      pricingVersion: "test-v1",
    });
    expect(
      await settlementStore.markDispatchStarted({
        workspaceId,
        smokeRunId,
        budgetEpochId: settlementEpochId,
        reservationKey: "settlement-key",
      }),
    ).toEqual({ marked: true, duplicate: false });
    const settlement = {
      workspaceId,
      smokeRunId,
      budgetEpochId: settlementEpochId,
      reservationKey: "settlement-key",
      providerRequestIdHash: "c".repeat(64),
      model: "gpt-5.6-luna",
      pricingVersion: "test-v1",
      inputUnits: 2,
      outputUnits: 3,
      settledMicroUsd: 10,
    } as const;
    expect(await settlementStore.settle(settlement)).toEqual({ settled: true, duplicate: false });
    expect(await settlementStore.settle(settlement)).toEqual({ settled: false, duplicate: true });
    await expect(settlementStore.markUnknownBillable({ ...settlement })).rejects.toThrow(
      "LIVE_SMOKE_UNKNOWN_STATE_INVALID",
    );

    const unknownEpochId = "00000000-0000-4000-8000-0000000003d3";
    await settlementStore.createEpoch({
      workspaceId,
      smokeRunId,
      budgetEpochId: unknownEpochId,
      limit: 3,
      reason: "unknown-billable",
    });
    await settlementStore.reserve({
      workspaceId,
      smokeRunId,
      budgetEpochId: unknownEpochId,
      reservationKey: "unknown-key",
      providerMode: "live",
      units: 1,
      limit: 3,
      reservedMicroUsd: 100,
      model: "gpt-5.6-luna",
      pricingVersion: "test-v1",
    });
    await settlementStore.markDispatchStarted({
      workspaceId,
      smokeRunId,
      budgetEpochId: unknownEpochId,
      reservationKey: "unknown-key",
    });
    expect(
      await settlementStore.markUnknownBillable({
        workspaceId,
        smokeRunId,
        budgetEpochId: unknownEpochId,
        reservationKey: "unknown-key",
      }),
    ).toEqual({ marked: true, duplicate: false });
    expect(
      await settlementStore.markUnknownBillable({
        workspaceId,
        smokeRunId,
        budgetEpochId: unknownEpochId,
        reservationKey: "unknown-key",
      }),
    ).toEqual({ marked: false, duplicate: true });
  });
});
