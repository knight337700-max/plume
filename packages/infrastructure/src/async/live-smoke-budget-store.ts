import type { Sql } from "postgres";
import { LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX } from "@plume/core/src/public.js";

export type LiveSmokeProviderMode = "mock" | "live";

export interface LiveSmokeBudgetReservationInput {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly reservationKey: string;
  readonly providerMode: LiveSmokeProviderMode;
  readonly units: number;
  readonly limit: number;
  readonly reservedMicroUsd?: number;
  readonly estimatedInputTokens?: number;
  readonly model?: string;
  readonly pricingVersion?: string;
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
  readonly policy?: LiveSmokeBudgetPolicyInput;
}

export interface LiveSmokeBudgetPolicyInput {
  readonly cachedInputMicroUsdPerMillionTokens: number;
  readonly maxEstimatedInputTokens: number;
  readonly perRunSoftStopMicroUsd: number;
  readonly perRunHardCapMicroUsd: number;
  readonly monthlyLimitMicroUsd: number;
  readonly safetyBufferMicroUsd: number;
  readonly absoluteProviderCallCap: number;
  readonly billingScope: string;
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
  markDispatchStarted(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }): Promise<{ readonly marked: boolean; readonly duplicate: boolean }>;
  settle(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
    readonly providerRequestIdHash: string;
    readonly model: string;
    readonly pricingVersion: string;
    readonly inputUnits: number;
    readonly cachedInputUnits?: number;
    readonly outputUnits: number;
    readonly settledMicroUsd: number;
  }): Promise<{ readonly settled: boolean; readonly duplicate: boolean }>;
  markUnknownBillable(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }): Promise<{ readonly marked: boolean; readonly duplicate: boolean }>;
  releasePreDispatch?(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }): Promise<{ readonly released: boolean; readonly used: number; readonly remaining: number }>;
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX)
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
  if (
    input.reservedMicroUsd !== undefined &&
    (!Number.isSafeInteger(input.reservedMicroUsd) || input.reservedMicroUsd < 0)
  )
    throw new Error("LIVE_SMOKE_RESERVED_COST_INVALID");
  if (
    input.estimatedInputTokens !== undefined &&
    (!Number.isSafeInteger(input.estimatedInputTokens) || input.estimatedInputTokens < 1)
  )
    throw new Error("LIVE_SMOKE_INPUT_ESTIMATE_INVALID");
}

function assertPolicyInput(policy: LiveSmokeBudgetPolicyInput): void {
  const integerValues = [
    policy.cachedInputMicroUsdPerMillionTokens,
    policy.maxEstimatedInputTokens,
    policy.perRunSoftStopMicroUsd,
    policy.perRunHardCapMicroUsd,
    policy.monthlyLimitMicroUsd,
    policy.safetyBufferMicroUsd,
    policy.absoluteProviderCallCap,
  ];
  if (integerValues.some((value) => !Number.isSafeInteger(value) || value <= 0))
    throw new Error("LIVE_SMOKE_BUDGET_POLICY_INVALID");
  if (
    policy.perRunSoftStopMicroUsd >= policy.perRunHardCapMicroUsd ||
    policy.perRunHardCapMicroUsd >= policy.monthlyLimitMicroUsd ||
    policy.safetyBufferMicroUsd >= policy.perRunHardCapMicroUsd ||
    policy.absoluteProviderCallCap > LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX ||
    !policy.billingScope.trim()
  )
    throw new Error("LIVE_SMOKE_BUDGET_POLICY_RELATION_INVALID");
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
    if (input.policy) {
      assertPolicyInput(input.policy);
      if (input.limit !== input.policy.absoluteProviderCallCap)
        throw new Error("LIVE_SMOKE_BUDGET_CALL_CAP_POLICY_MISMATCH");
    }
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
      if (input.policy) {
        await transaction`
          INSERT INTO live_smoke_budget_policy
            (workspace_id, smoke_run_id, budget_epoch_id,
             cached_input_micro_usd_per_million,
             max_estimated_input_tokens, per_run_soft_stop_micro_usd,
             per_run_hard_cap_micro_usd, monthly_limit_micro_usd,
             safety_buffer_micro_usd, absolute_provider_call_cap, billing_scope)
          VALUES
            (${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
             ${input.policy.cachedInputMicroUsdPerMillionTokens},
             ${input.policy.maxEstimatedInputTokens}, ${input.policy.perRunSoftStopMicroUsd},
             ${input.policy.perRunHardCapMicroUsd}, ${input.policy.monthlyLimitMicroUsd},
             ${input.policy.safetyBufferMicroUsd}, ${input.policy.absoluteProviderCallCap},
             ${input.policy.billingScope})
          ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id) DO NOTHING
        `;
      }
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

      const existing = await transaction<{ units: number }[]>`
        SELECT units
        FROM live_smoke_budget_epoch_reservation
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
      `;
      if (existing.length > 0) {
        return {
          allowed: true,
          duplicate: true,
          used: ledger.used_units,
          remaining: Math.max(0, ledger.call_limit - ledger.used_units),
        };
      }

      const policyRows = await transaction<
        {
          readonly cached_input_micro_usd_per_million: number;
          readonly max_estimated_input_tokens: number;
          readonly per_run_soft_stop_micro_usd: number;
          readonly per_run_hard_cap_micro_usd: number;
          readonly monthly_limit_micro_usd: number;
          readonly safety_buffer_micro_usd: number;
          readonly absolute_provider_call_cap: number;
          readonly billing_scope: string;
        }[]
      >`
        SELECT cached_input_micro_usd_per_million,
               max_estimated_input_tokens, per_run_soft_stop_micro_usd,
               per_run_hard_cap_micro_usd, monthly_limit_micro_usd,
               safety_buffer_micro_usd, absolute_provider_call_cap, billing_scope
        FROM live_smoke_budget_policy
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
        FOR UPDATE
      `;
      const policy = policyRows[0];
      if (policy) {
        if (
          input.estimatedInputTokens === undefined ||
          input.estimatedInputTokens > policy.max_estimated_input_tokens
        )
          return {
            allowed: false,
            duplicate: false,
            used: ledger.used_units,
            remaining: Math.max(0, ledger.call_limit - ledger.used_units),
          };
        const reservedMicroUsd = input.reservedMicroUsd ?? 0;
        const currentRun = await transaction<{ exposure: number }[]>`
          SELECT COALESCE(SUM(
            CASE WHEN state IN ('RESERVED', 'DISPATCH_STARTED', 'UNKNOWN_BILLABLE')
                   THEN reserved_micro_usd
                 WHEN state = 'SETTLED' THEN COALESCE(settled_micro_usd, reserved_micro_usd)
                 ELSE 0 END
          ), 0)::bigint AS exposure
          FROM live_smoke_spend_ledger AS l
          JOIN live_smoke_budget_policy AS p
            ON p.workspace_id = l.workspace_id
           AND p.smoke_run_id = l.smoke_run_id
           AND p.budget_epoch_id = l.budget_epoch_id
          WHERE l.workspace_id = ${input.workspaceId}
            AND l.smoke_run_id = ${input.smokeRunId}
            AND p.billing_scope = ${policy.billing_scope}
            AND l.billing_period = date_trunc('month', now())::date
        `;
        const monthly = await transaction<{ exposure: number }[]>`
          SELECT COALESCE(SUM(
            CASE WHEN l.state IN ('RESERVED', 'DISPATCH_STARTED', 'UNKNOWN_BILLABLE')
                   THEN l.reserved_micro_usd
                 WHEN l.state = 'SETTLED' THEN COALESCE(l.settled_micro_usd, l.reserved_micro_usd)
                 ELSE 0 END
          ), 0)::bigint AS exposure
          FROM live_smoke_spend_ledger AS l
          JOIN live_smoke_budget_policy AS p
            ON p.workspace_id = l.workspace_id
           AND p.smoke_run_id = l.smoke_run_id
           AND p.budget_epoch_id = l.budget_epoch_id
          WHERE p.billing_scope = ${policy.billing_scope}
            AND l.billing_period = date_trunc('month', now())::date
        `;
        const adjustmentTable = await transaction<{ exists: boolean }[]>`
          SELECT to_regclass('public.live_smoke_reconciliation_adjustments') IS NOT NULL AS exists
        `;
        const carryForward = adjustmentTable[0]?.exists
          ? await transaction<{ exposure: number }[]>`
              SELECT COALESCE(SUM(conservative_micro_usd), 0)::bigint AS exposure
              FROM live_smoke_reconciliation_adjustments
              WHERE billing_scope = ${policy.billing_scope}
                AND billing_period_utc = date_trunc('month', now())::date
            `
          : [{ exposure: 0 }];
        const runExposure = Number(currentRun[0]?.exposure ?? 0);
        const monthlyExposure =
          Number(monthly[0]?.exposure ?? 0) + Number(carryForward[0]?.exposure ?? 0);
        const effectiveHardCap = policy.per_run_hard_cap_micro_usd - policy.safety_buffer_micro_usd;
        if (
          !Number.isSafeInteger(reservedMicroUsd) ||
          reservedMicroUsd < 0 ||
          runExposure + reservedMicroUsd > policy.per_run_soft_stop_micro_usd ||
          runExposure + reservedMicroUsd > effectiveHardCap ||
          monthlyExposure + reservedMicroUsd >
            policy.monthly_limit_micro_usd - policy.safety_buffer_micro_usd
        )
          return {
            allowed: false,
            duplicate: false,
            used: ledger.used_units,
            remaining: Math.max(0, ledger.call_limit - ledger.used_units),
          };
      }

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
        throw new Error("LIVE_SMOKE_RESERVATION_CONFLICT");
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
      await transaction`
        INSERT INTO live_smoke_spend_ledger
          (workspace_id, smoke_run_id, budget_epoch_id, reservation_key,
           billing_period, state, reserved_micro_usd, model, pricing_version)
        VALUES
          (${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
           ${input.reservationKey}, date_trunc('month', now())::date, 'RESERVED',
           ${input.reservedMicroUsd ?? 0}, ${input.model ?? "unspecified"},
           ${input.pricingVersion ?? "unspecified"})
      `;
      return {
        allowed: true,
        duplicate: false,
        used: updated[0].used_units,
        remaining: updated[0].call_limit - updated[0].used_units,
      };
    });
  }

  async markDispatchStarted(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }) {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<{ state: string }[]>`
        SELECT state
        FROM live_smoke_spend_ledger
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("LIVE_SMOKE_SPEND_RESERVATION_NOT_FOUND");
      if (row.state !== "RESERVED") return { marked: false, duplicate: true };
      const updated = await transaction`
        UPDATE live_smoke_spend_ledger
        SET state = 'DISPATCH_STARTED', updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
          AND state = 'RESERVED'
      `;
      return { marked: updated.count === 1, duplicate: false };
    });
  }

  async settle(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
    readonly providerRequestIdHash: string;
    readonly model: string;
    readonly pricingVersion: string;
    readonly inputUnits: number;
    readonly cachedInputUnits?: number;
    readonly outputUnits: number;
    readonly settledMicroUsd: number;
  }) {
    if (!/^[a-f0-9]{64}$/u.test(input.providerRequestIdHash))
      throw new Error("LIVE_SMOKE_PROVIDER_REQUEST_HASH_INVALID");
    if (
      !Number.isSafeInteger(input.inputUnits) ||
      input.inputUnits < 0 ||
      !Number.isSafeInteger(input.outputUnits) ||
      input.outputUnits < 0 ||
      (input.cachedInputUnits !== undefined &&
        (!Number.isSafeInteger(input.cachedInputUnits) ||
          input.cachedInputUnits < 0 ||
          input.cachedInputUnits > input.inputUnits)) ||
      !Number.isSafeInteger(input.settledMicroUsd) ||
      input.settledMicroUsd < 0
    )
      throw new Error("LIVE_SMOKE_SETTLEMENT_USAGE_INVALID");
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<{ state: string; reserved_micro_usd: number }[]>`
        SELECT state, reserved_micro_usd
        FROM live_smoke_spend_ledger
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("LIVE_SMOKE_SPEND_RESERVATION_NOT_FOUND");
      if (row.state === "SETTLED") return { settled: false, duplicate: true };
      if (row.state === "UNKNOWN_BILLABLE" || row.state === "RELEASED")
        throw new Error("LIVE_SMOKE_SETTLEMENT_STATE_INVALID");
      if (input.settledMicroUsd > row.reserved_micro_usd)
        throw new Error("LIVE_SMOKE_SETTLEMENT_EXCEEDS_RESERVATION");
      const updated = await transaction`
        UPDATE live_smoke_spend_ledger
        SET state = 'SETTLED',
            settled_micro_usd = ${input.settledMicroUsd},
            provider_request_id_hash = ${input.providerRequestIdHash},
            model = ${input.model},
            pricing_version = ${input.pricingVersion},
            input_units = ${input.inputUnits},
            cached_input_units = ${input.cachedInputUnits ?? 0},
            output_units = ${input.outputUnits},
            updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
          AND state IN ('RESERVED', 'DISPATCH_STARTED')
      `;
      return { settled: updated.count === 1, duplicate: false };
    });
  }

  async markUnknownBillable(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }) {
    return this.sql.begin(async (transaction) => {
      const rows = await transaction<{ state: string }[]>`
        SELECT state
        FROM live_smoke_spend_ledger
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("LIVE_SMOKE_SPEND_RESERVATION_NOT_FOUND");
      if (row.state === "UNKNOWN_BILLABLE") return { marked: false, duplicate: true };
      if (row.state === "SETTLED" || row.state === "RELEASED")
        throw new Error("LIVE_SMOKE_UNKNOWN_STATE_INVALID");
      const updated = await transaction`
        UPDATE live_smoke_spend_ledger
        SET state = 'UNKNOWN_BILLABLE', updated_at = now()
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
          AND state IN ('RESERVED', 'DISPATCH_STARTED')
      `;
      return { marked: updated.count === 1, duplicate: false };
    });
  }

  async releasePreDispatch(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }) {
    return this.sql.begin(async (transaction) => {
      const removed = await transaction<{ units: number }[]>`
        DELETE FROM live_smoke_budget_epoch_reservation
        WHERE workspace_id = ${input.workspaceId}
          AND smoke_run_id = ${input.smokeRunId}
          AND budget_epoch_id = ${input.budgetEpochId}
          AND reservation_key = ${input.reservationKey}
        RETURNING units
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
      const epoch = rows[0];
      if (!epoch) throw new Error("LIVE_SMOKE_BUDGET_EPOCH_NOT_FOUND");
      if (removed.length > 0) {
        await transaction`
          UPDATE live_smoke_spend_ledger
          SET state = 'RELEASED', updated_at = now()
          WHERE workspace_id = ${input.workspaceId}
            AND smoke_run_id = ${input.smokeRunId}
            AND budget_epoch_id = ${input.budgetEpochId}
            AND reservation_key = ${input.reservationKey}
            AND state = 'RESERVED'
        `;
        const updated = await transaction<EpochRow[]>`
          UPDATE live_smoke_budget_epoch
          SET used_units = used_units - ${removed[0]!.units},
              status = CASE WHEN status = 'CLOSED_EXHAUSTED' THEN 'OPEN' ELSE status END,
              updated_at = now()
          WHERE workspace_id = ${input.workspaceId}
            AND smoke_run_id = ${input.smokeRunId}
            AND budget_epoch_id = ${input.budgetEpochId}
          RETURNING workspace_id, smoke_run_id, budget_epoch_id,
                    parent_budget_epoch_id, call_limit, used_units, status
        `;
        const next = updated[0]!;
        return {
          released: true,
          used: next.used_units,
          remaining: next.call_limit - next.used_units,
        };
      }
      return {
        released: false,
        used: epoch.used_units,
        remaining: Math.max(0, epoch.call_limit - epoch.used_units),
      };
    });
  }
}
