import type { Sql } from "postgres";

export type LiveSmokeProviderMode = "mock" | "live";

export interface LiveSmokeBudgetReservationInput {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly reservationKey: string;
  readonly providerMode: LiveSmokeProviderMode;
  readonly units: number;
  readonly limit: number;
}

export interface LiveSmokeBudgetReservation {
  readonly allowed: boolean;
  readonly duplicate: boolean;
  readonly used: number;
  readonly remaining: number;
}

export interface LiveSmokeBudgetEpochInput {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentBudgetEpochId?: string | null;
  readonly limit: number;
  readonly reason: string;
}

export interface LiveSmokeBudgetEpoch {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentBudgetEpochId: string | null;
  readonly limit: number;
  readonly used: number;
  readonly status: "OPEN" | "CLOSED_EXHAUSTED" | "CLOSED";
}

export interface LiveSmokeBudgetStore {
  createEpoch(input: LiveSmokeBudgetEpochInput): Promise<LiveSmokeBudgetEpoch>;
  reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation>;
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error("LIVE_SMOKE_BUDGET_LIMIT_INVALID");
}

function assertReservationInput(input: LiveSmokeBudgetReservationInput): void {
  if (!Number.isInteger(input.units) || input.units < 1)
    throw new Error("LIVE_SMOKE_BUDGET_UNITS_INVALID");
  assertLimit(input.limit);
  if (input.units > input.limit) throw new Error("LIVE_SMOKE_BUDGET_UNITS_EXCEED_LIMIT");
  if (input.reservationKey.length < 1 || input.reservationKey.length > 250)
    throw new Error("LIVE_SMOKE_RESERVATION_KEY_INVALID");
  if (input.providerMode !== "mock" && input.providerMode !== "live")
    throw new Error("LIVE_SMOKE_PROVIDER_MODE_INVALID");
}

interface EpochRow {
  readonly workspace_id: string;
  readonly smoke_run_id: string;
  readonly budget_epoch_id: string;
  readonly parent_budget_epoch_id: string | null;
  readonly call_limit: number;
  readonly used_units: number;
  readonly status: "OPEN" | "CLOSED_EXHAUSTED" | "CLOSED";
}

function mapEpoch(row: EpochRow): LiveSmokeBudgetEpoch {
  return {
    workspaceId: row.workspace_id,
    smokeRunId: row.smoke_run_id,
    budgetEpochId: row.budget_epoch_id,
    parentBudgetEpochId: row.parent_budget_epoch_id,
    limit: row.call_limit,
    used: row.used_units,
    status: row.status,
  };
}

/**
 * Postgres-backed workflow budget. Only live provider calls enter the durable
 * ledger; mock executions are intentionally non-billable and non-reserving.
 */
export class PostgresLiveSmokeBudgetStore implements LiveSmokeBudgetStore {
  public constructor(private readonly sql: Sql) {}

  async createEpoch(input: LiveSmokeBudgetEpochInput): Promise<LiveSmokeBudgetEpoch> {
    assertLimit(input.limit);
    if (!input.reason.trim()) throw new Error("LIVE_SMOKE_BUDGET_EPOCH_REASON_REQUIRED");
    return this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO live_smoke_budget_epoch
          (workspace_id, smoke_run_id, budget_epoch_id, parent_budget_epoch_id, call_limit, reason)
        VALUES
          (${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
           ${input.parentBudgetEpochId ?? null}, ${input.limit}, ${input.reason})
        ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id) DO NOTHING
      `;
      const rows = await transaction<EpochRow[]>`
        SELECT workspace_id, smoke_run_id, budget_epoch_id,
               parent_budget_epoch_id, call_limit, used_units, status
        FROM live_smoke_budget_epoch
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("LIVE_SMOKE_BUDGET_EPOCH_CREATE_FAILED");
      if (row.call_limit !== input.limit) throw new Error("LIVE_SMOKE_BUDGET_EPOCH_LIMIT_MISMATCH");
      if ((row.parent_budget_epoch_id ?? null) !== (input.parentBudgetEpochId ?? null))
        throw new Error("LIVE_SMOKE_BUDGET_EPOCH_PARENT_MISMATCH");
      return mapEpoch(row);
    });
  }

  async reserve(input: LiveSmokeBudgetReservationInput): Promise<LiveSmokeBudgetReservation> {
    assertReservationInput(input);
    if (input.providerMode === "mock") {
      return { allowed: true, duplicate: false, used: 0, remaining: input.limit };
    }
    return this.sql.begin(async (transaction) => {
      const ledgerRows = await transaction<EpochRow[]>`
        SELECT workspace_id, smoke_run_id, budget_epoch_id,
               parent_budget_epoch_id, call_limit, used_units, status
        FROM live_smoke_budget_epoch
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
        FOR UPDATE
      `;
      const ledger = ledgerRows[0];
      if (!ledger) throw new Error("LIVE_SMOKE_BUDGET_EPOCH_NOT_FOUND");
      if (ledger.call_limit !== input.limit)
        throw new Error("LIVE_SMOKE_BUDGET_EPOCH_LIMIT_MISMATCH");
      if (ledger.status !== "OPEN") {
        return {
          allowed: false,
          duplicate: false,
          used: ledger.used_units,
          remaining: Math.max(0, ledger.call_limit - ledger.used_units),
        };
      }

      const inserted = await transaction<{ units: number }[]>`
        INSERT INTO live_smoke_budget_epoch_reservation
          (workspace_id, smoke_run_id, budget_epoch_id, reservation_key, units)
        VALUES
          (${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
           ${input.reservationKey}, ${input.units})
        ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id, reservation_key) DO NOTHING
        RETURNING units
      `;
      if (inserted.length === 0) {
        return {
          allowed: true,
          duplicate: true,
          used: ledger.used_units,
          remaining: ledger.call_limit - ledger.used_units,
        };
      }

      const updated = await transaction<EpochRow[]>`
        UPDATE live_smoke_budget_epoch
        SET used_units = used_units + ${input.units},
            status = CASE WHEN used_units + ${input.units} >= call_limit
                          THEN 'CLOSED_EXHAUSTED' ELSE status END,
            updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND status = 'OPEN'
          AND used_units + ${input.units} <= call_limit
        RETURNING workspace_id, smoke_run_id, budget_epoch_id,
                  parent_budget_epoch_id, call_limit, used_units, status
      `;
      if (!updated[0]) {
        await transaction`
          DELETE FROM live_smoke_budget_epoch_reservation
          WHERE workspace_id = ${input.workspaceId}
            AND smoke_run_id = ${input.smokeRunId}
            AND budget_epoch_id = ${input.budgetEpochId}
            AND reservation_key = ${input.reservationKey}
        `;
        return {
          allowed: false,
          duplicate: false,
          used: ledger.used_units,
          remaining: Math.max(0, ledger.call_limit - ledger.used_units),
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
