import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresLiveSmokeBudgetStore,
  type LiveSmokeBudgetStore,
} from "./live-smoke-budget-store.js";

const enabled = process.env.RUN_LIVE_SMOKE_BUDGET_DB_TEST === "true";
const workspaceId = "00000000-0000-4000-8000-0000000002e0";
const smokeRunId = "00000000-0000-4000-8000-0000000002e1";
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
  });

  afterAll(async () => {
    await sql`
      DELETE FROM live_smoke_budget_reservation
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql`
      DELETE FROM live_smoke_budget_ledger
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
          reservationKey: `item-${index}:initial`,
          units: 1,
          limit: 20,
        }),
      ),
    );
    expect(reservations.every((reservation) => reservation.allowed)).toBe(true);
    const overflow = await new PostgresLiveSmokeBudgetStore(sql).reserve({
      workspaceId,
      smokeRunId,
      reservationKey: "overflow:initial",
      units: 1,
      limit: 20,
    });
    expect(overflow).toMatchObject({ allowed: false, used: 20, remaining: 0 });
    const duplicate = await new PostgresLiveSmokeBudgetStore(sql).reserve({
      workspaceId,
      smokeRunId,
      reservationKey: "item-0:initial",
      units: 1,
      limit: 20,
    });
    expect(duplicate).toMatchObject({ allowed: true, duplicate: true, used: 20, remaining: 0 });
  });
});
