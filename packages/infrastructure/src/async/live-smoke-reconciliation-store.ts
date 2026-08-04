import type { Sql } from "postgres";

export interface LiveSmokeReconciliationAdjustmentInput {
  readonly adjustmentKey: string;
  readonly billingScope: string;
  readonly billingPeriodUtc: string;
  readonly sourceApprovalId: string;
  readonly reasonCode: "UNKNOWN_BILLABLE_CARRY_FORWARD";
  readonly conservativeMicroUsd: number;
  readonly representsActualCost: false;
}

export class PostgresLiveSmokeReconciliationStore {
  public constructor(private readonly sql: Sql) {}

  async insertAdjustment(input: LiveSmokeReconciliationAdjustmentInput) {
    if (!Number.isSafeInteger(input.conservativeMicroUsd) || input.conservativeMicroUsd < 0)
      throw new Error("LIVE_SMOKE_RECONCILIATION_AMOUNT_INVALID");
    if (input.representsActualCost !== false)
      throw new Error("LIVE_SMOKE_RECONCILIATION_ACTUAL_COST_FORBIDDEN");
    const rows = await this.sql`
      INSERT INTO live_smoke_reconciliation_adjustments
        (adjustment_key, billing_scope, billing_period_utc, source_approval_id,
         reason_code, conservative_micro_usd, represents_actual_cost)
      VALUES
        (${input.adjustmentKey}, ${input.billingScope}, ${input.billingPeriodUtc},
         ${input.sourceApprovalId}, ${input.reasonCode}, ${input.conservativeMicroUsd}, false)
      ON CONFLICT (adjustment_key) DO NOTHING
      RETURNING adjustment_key
    `;
    return { inserted: rows.length > 0, duplicate: rows.length === 0 };
  }

  async monthlyConservativeExposure(input: {
    readonly billingScope: string;
    readonly billingPeriodUtc: string;
  }): Promise<number> {
    const rows = await this.sql<{ total: number }[]>`
      SELECT COALESCE(SUM(conservative_micro_usd), 0)::bigint AS total
      FROM live_smoke_reconciliation_adjustments
      WHERE billing_scope = ${input.billingScope}
        AND billing_period_utc = ${input.billingPeriodUtc}
    `;
    return Number(rows[0]?.total ?? 0);
  }
}
