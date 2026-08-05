import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportFinalLiveSmokeEvidence } from "./live-smoke-evidence-exporter.js";

const enabled = process.env.RUN_LIVE_SMOKE_EVIDENCE_EXPORT_DB_TEST === "true";
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() || "";

let sql: Sql;
let workspaceId: string;
let smokeRunId: string;
let budgetEpochId: string;

describe.skipIf(!enabled)("postgres live smoke evidence export", () => {
  beforeAll(async () => {
    if (!databaseUrl) throw new Error("TEST_DATABASE_URL_REQUIRED");
    sql = postgres(databaseUrl, { max: 4, onnotice: () => undefined });
    workspaceId = randomUUID();
    smokeRunId = randomUUID();
    budgetEpochId = randomUUID();
    await sql`SELECT 1`;
    await sql`
      INSERT INTO live_smoke_budget_epoch
        (workspace_id, smoke_run_id, budget_epoch_id, call_limit, used_units, status, reason)
      VALUES
        (${workspaceId}, ${smokeRunId}, ${budgetEpochId}, 4, 0, 'OPEN', 'evidence-export-integration')
    `;
    await sql`
      INSERT INTO live_smoke_budget_policy
        (workspace_id, smoke_run_id, budget_epoch_id,
         cached_input_micro_usd_per_million, max_estimated_input_tokens,
         per_run_soft_stop_micro_usd, per_run_hard_cap_micro_usd,
         monthly_limit_micro_usd, safety_buffer_micro_usd,
         absolute_provider_call_cap, billing_scope)
      VALUES
        (${workspaceId}, ${smokeRunId}, ${budgetEpochId},
         100000, 250000, 250000, 750000,
         5000000, 250000, 4, 'integration-test')
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`
      DELETE FROM live_smoke_budget_policy
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql`
      DELETE FROM live_smoke_budget_epoch
      WHERE workspace_id = ${workspaceId} AND smoke_run_id = ${smokeRunId}
    `;
    await sql.end({ timeout: 5 });
  });

  it("observes PostgreSQL alias casing and uses exact snake_case keys", async () => {
    const legacy = await sql.unsafe("SELECT 1::int AS budgetEpoch");
    expect(Object.keys(legacy[0] ?? {})).toEqual(["budgetepoch"]);

    const canonical = await sql`
      SELECT
        1::int AS budget_epoch,
        0::int AS spend_ledger,
        0::int AS lifecycle,
        0::int AS validation_evidence,
        0::int AS coverage,
        0::int AS failure,
        0::int AS canary
    `;
    expect(Object.keys(canonical[0] ?? {})).toEqual([
      "budget_epoch",
      "spend_ledger",
      "lifecycle",
      "validation_evidence",
      "coverage",
      "failure",
      "canary",
    ]);
  });

  it("exports and replays an epoch-1 zero-evidence bundle idempotently", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-postgres-"));
    const approvalId = `PLUME-GATE-I-2.5C-B4-${randomUUID()}`;
    try {
      const input = {
        sql,
        exportRoot,
        approvalId,
        smokeRunId,
        budgetEpochId,
        scenarioId: "SYNTHETIC_JACOMO_KAKAO_BIZBOARD_2026_1",
        conservativeCarryForwardMicroUsd: 1_500_000,
        workerWithSecretStopped: true,
        additionalDispatchBlocked: true,
        runTerminal: true,
        ledgerStateStable: true,
      } as const;
      const first = await exportFinalLiveSmokeEvidence(input);
      expect(first).toMatchObject({
        status: "COMPLETE",
        created: true,
        counts: {
          budgetEpoch: 1,
          spendLedger: 0,
          lifecycle: 0,
          validationEvidence: 0,
          coverage: 0,
          failure: 0,
          canary: 0,
        },
      });
      const files = await readdir(first.finalDirectory);
      expect(files).toEqual(
        expect.arrayContaining(["manifest.json", "manifest.sha256", "EXPORT_COMPLETE"]),
      );
      expect(await readFile(join(first.finalDirectory, "EXPORT_COMPLETE"), "utf8")).toBe(
        "EXPORT_COMPLETE\n",
      );
      const manifest = JSON.parse(
        await readFile(join(first.finalDirectory, "manifest.json"), "utf8"),
      ) as { exporterVersion: string; counts: Record<string, number>; exportStatus: string };
      expect(manifest).toMatchObject({
        exporterVersion: "live-smoke-evidence-exporter-v3",
        exportStatus: "COMPLETE",
        counts: first.counts,
      });
      expect(await readFile(join(first.finalDirectory, "manifest.sha256"), "utf8")).toMatch(
        /^[a-f0-9]{64}\n$/u,
      );

      const second = await exportFinalLiveSmokeEvidence(input);
      expect(second).toMatchObject({
        status: "COMPLETE",
        created: false,
        bundleHash: first.bundleHash,
        manifestHash: first.manifestHash,
        counts: first.counts,
      });
      expect(await readdir(join(exportRoot, approvalId))).toHaveLength(1);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });
});
