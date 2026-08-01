import type { Sql } from "postgres";

export interface LiveSmokeBudgetReservationInput {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly reservationKey: string;
  readonly units: number;
  readonly limit: number;
}

export interface LiveSmokeBudgetReservation {
  readonly allowed: boolean;
  readonly duplicate: boolean;
  readonly used: number;
  readonly remaining: number;
}

export interface LiveSmokeBudgetStore {
  reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation>;
}

function assertInput(input: LiveSmokeBudgetReservationInput): void {
  if (!Number.isInteger(input.units) || input.units < 1)
    throw new Error("LIVE_SMOKE_BUDGET_UNITS_INVALID");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20)
    throw new Error("LIVE_SMOKE_BUDGET_LIMIT_INVALID");
  if (input.units > input.limit) throw new Error("LIVE_SMOKE_BUDGET_UNITS_EXCEED_LIMIT");
  if (input.reservationKey.length < 1 || input.reservationKey.length > 250)
    throw new Error("LIVE_SMOKE_RESERVATION_KEY_INVALID");
}

/**
 * Postgres-backed workflow budget. The ledger row is locked inside the same
 * transaction as the unique reservation insert, so worker processes and
 * restarts share one atomic counter without a process-local map.
 */
export class PostgresLiveSmokeBudgetStore implements LiveSmokeBudgetStore {
  public constructor(private readonly sql: Sql) {}

  async reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation> {
    assertInput(input);
    return this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO live_smoke_budget_ledger
          (workspace_id, smoke_run_id, call_limit, used_units)
        VALUES
          (${input.workspaceId}, ${input.smokeRunId}, ${input.limit}, 0)
        ON CONFLICT (workspace_id, smoke_run_id) DO NOTHING
      `;

      const ledger = await transaction<
        {
          used_units: number;
          call_limit: number;
        }[]
      >`
        SELECT used_units, call_limit
        FROM live_smoke_budget_ledger
        WHERE workspace_id = ${input.workspaceId} AND smoke_run_id = ${input.smokeRunId}
        FOR UPDATE
      `;
      const current = ledger[0];
      if (!current) throw new Error("LIVE_SMOKE_BUDGET_LEDGER_NOT_FOUND");
      if (current.call_limit !== input.limit) throw new Error("LIVE_SMOKE_BUDGET_LIMIT_MISMATCH");

      const inserted = await transaction<{ units: number }[]>`
        INSERT INTO live_smoke_budget_reservation
          (workspace_id, smoke_run_id, reservation_key, units)
        VALUES
          (${input.workspaceId}, ${input.smokeRunId}, ${input.reservationKey}, ${input.units})
        ON CONFLICT (workspace_id, smoke_run_id, reservation_key) DO NOTHING
        RETURNING units
      `;
      if (inserted.length === 0) {
        return {
          allowed: true,
          duplicate: true,
          used: current.used_units,
          remaining: current.call_limit - current.used_units,
        };
      }

      const updated = await transaction<{ used_units: number; call_limit: number }[]>`
        UPDATE live_smoke_budget_ledger
        SET used_units = used_units + ${input.units}, updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND used_units + ${input.units} <= call_limit
        RETURNING used_units, call_limit
      `;
      if (!updated[0]) {
        await transaction`
          DELETE FROM live_smoke_budget_reservation
          WHERE workspace_id = ${input.workspaceId}
            AND smoke_run_id = ${input.smokeRunId}
            AND reservation_key = ${input.reservationKey}
        `;
        return {
          allowed: false,
          duplicate: false,
          used: current.used_units,
          remaining: current.call_limit - current.used_units,
        };
      }
      return {
        allowed: true,
        duplicate: false,
        used: updated[0].used_units,
        remaining: updated[0].call_limit - updated[0].used_units,
      };
    });
  }
}
