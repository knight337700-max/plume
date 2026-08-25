import { createDatabaseClient } from "../../../packages/db/src/client.js";
import { PostgresLiveSmokeReconciliationStore } from "../../../packages/infrastructure/src/async/live-smoke-reconciliation-store.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LIVE_SMOKE_RECONCILIATION_${name}_REQUIRED`);
  return value;
};

export async function recordUnknownBillableCarryForward(): Promise<void> {
  const sourceApprovalId = required("LIVE_SMOKE_RECONCILIATION_SOURCE_APPROVAL_ID");
  const adjustmentKey = required("LIVE_SMOKE_RECONCILIATION_ADJUSTMENT_KEY");
  const billingScope = required("LIVE_SMOKE_RECONCILIATION_BILLING_SCOPE");
  const billingPeriodUtc = required("LIVE_SMOKE_RECONCILIATION_BILLING_PERIOD_UTC");
  const amount = Number(required("LIVE_SMOKE_RECONCILIATION_MICRO_USD"));
  const database = createDatabaseClient();
  try {
    const result = await new PostgresLiveSmokeReconciliationStore(database.sql).insertAdjustment({
      adjustmentKey,
      billingScope,
      billingPeriodUtc,
      sourceApprovalId,
      reasonCode: "UNKNOWN_BILLABLE_CARRY_FORWARD",
      conservativeMicroUsd: amount,
      representsActualCost: false,
    });
    console.log(
      JSON.stringify({
        status: "RECORDED",
        inserted: result.inserted,
        duplicate: result.duplicate,
        representsActualCost: false,
      }),
    );
  } finally {
    await database.sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("live-smoke-reconciliation-command.ts")) {
  await recordUnknownBillableCarryForward().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "LIVE_SMOKE_RECONCILIATION_FAILED");
    process.exitCode = 1;
  });
}
