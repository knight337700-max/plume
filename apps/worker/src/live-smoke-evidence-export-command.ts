import { resolve } from "node:path";
import { createDatabaseClient } from "../../../packages/db/src/client.js";
import { exportLiveSmokeEvidence } from "../../../packages/infrastructure/src/async/live-smoke-evidence-exporter.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`LIVE_SMOKE_EXPORT_${name}_REQUIRED`);
  return value;
};

export async function runLiveSmokeEvidenceExport(): Promise<void> {
  const database = createDatabaseClient();
  try {
    const result = await exportLiveSmokeEvidence({
      sql: database.sql,
      exportRoot: resolve(
        process.env.LIVE_SMOKE_EVIDENCE_EXPORT_ROOT?.trim() || "reports/live-evidence",
      ),
      approvalId: required("LIVE_SMOKE_EVIDENCE_APPROVAL_ID"),
      smokeRunId: required("LIVE_SMOKE_EVIDENCE_SMOKE_RUN_ID"),
      ...(process.env.LIVE_SMOKE_EVIDENCE_BUDGET_EPOCH_ID?.trim()
        ? { budgetEpochId: process.env.LIVE_SMOKE_EVIDENCE_BUDGET_EPOCH_ID.trim() }
        : {}),
      scenarioId: required("LIVE_SMOKE_EVIDENCE_SCENARIO_ID"),
      conservativeCarryForwardMicroUsd: Number(
        process.env.LIVE_SMOKE_EVIDENCE_CARRY_FORWARD_MICRO_USD ?? "0",
      ),
    });
    console.log(
      JSON.stringify({
        status: result.status,
        created: result.created,
        bundleHash: result.bundleHash,
        manifestHash: result.manifestHash,
        counts: result.counts,
      }),
    );
  } finally {
    await database.sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("live-smoke-evidence-export-command.ts")) {
  await runLiveSmokeEvidenceExport().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "LIVE_SMOKE_EVIDENCE_EXPORT_FAILED");
    process.exitCode = 1;
  });
}
