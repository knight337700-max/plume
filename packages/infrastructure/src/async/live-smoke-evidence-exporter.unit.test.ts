import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import {
  exportLiveSmokeEvidence,
  type LiveSmokeEvidenceExportInput,
} from "./live-smoke-evidence-exporter.js";

type TaggedQuery = {
  <T extends readonly Record<string, unknown>[]>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T>;
  begin<T>(callback: (transaction: TaggedQuery) => Promise<T>): Promise<T>;
};

function fakeSql(options?: { readonly validationCount?: number }): Sql {
  let auditBundleHash: string | undefined;
  let auditWritten = false;
  const counts = {
    budgetEpoch: 0,
    spendLedger: 0,
    lifecycle: 0,
    validationEvidence: options?.validationCount ?? 0,
    coverage: 0,
    failure: 0,
    canary: 0,
  };
  const runQuery = (strings: TemplateStringsArray, values: readonly unknown[]) => {
    const query = strings.join(" ");
    if (query.includes("SELECT count(*)::int FROM live_smoke_budget_epoch"))
      return [counts] as readonly Record<string, unknown>[];
    if (query.includes("INSERT INTO live_smoke_evidence_exports")) {
      if (auditWritten) return [] as readonly Record<string, unknown>[];
      auditWritten = true;
      auditBundleHash = String(values[3]);
      return [{ export_id: "export-id" }];
    }
    if (query.includes("SELECT bundle_hash FROM live_smoke_evidence_exports"))
      return auditBundleHash ? [{ bundle_hash: auditBundleHash }] : [];
    return [] as readonly Record<string, unknown>[];
  };
  const transaction = ((strings: TemplateStringsArray, ...values: readonly unknown[]) =>
    Promise.resolve(runQuery(strings, values))) as TaggedQuery;
  const sql = ((strings: TemplateStringsArray, ...values: readonly unknown[]) =>
    Promise.resolve(runQuery(strings, values))) as TaggedQuery;
  sql.begin = async <T>(callback: (transaction: TaggedQuery) => Promise<T>) =>
    callback(transaction);
  return sql as unknown as Sql;
}

async function createInput(exportRoot: string, sql: Sql): Promise<LiveSmokeEvidenceExportInput> {
  return {
    sql,
    exportRoot,
    approvalId: "PLUME-GATE-I-2.5C-B-DIAG-54DF7982-20260804-R4",
    smokeRunId: "smoke-run-1",
    budgetEpochId: "epoch-1",
    scenarioId: "CANARY_PLUS_CAMPAIGN_ANALYST_DIAGNOSTIC_V1",
    conservativeCarryForwardMicroUsd: 1_500_000,
  };
}

describe("redacted live evidence export", () => {
  it("writes the complete bundle and returns created=false on an idempotent replay", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-"));
    try {
      const sql = fakeSql();
      const input = await createInput(exportRoot, sql);
      const first = await exportLiveSmokeEvidence(input);
      expect(first.status).toBe("COMPLETE");
      expect(first.created).toBe(true);
      expect(await readFile(join(first.finalDirectory, "EXPORT_COMPLETE"), "utf8")).toBe(
        "EXPORT_COMPLETE\n",
      );
      expect(await readdir(first.finalDirectory)).toEqual(
        expect.arrayContaining([
          "run-summary.json",
          "budget-epoch.json",
          "spend-ledger.jsonl",
          "lifecycle.jsonl",
          "validation-evidence.jsonl",
          "coverage.jsonl",
          "failure.json",
          "spend-summary.json",
          "manifest.json",
          "manifest.sha256",
          "EXPORT_COMPLETE",
        ]),
      );
      const second = await exportLiveSmokeEvidence(input);
      expect(second).toMatchObject({
        status: "COMPLETE",
        created: false,
        bundleHash: first.bundleHash,
        manifestHash: first.manifestHash,
      });
      expect(await readdir(join(exportRoot, input.approvalId))).toHaveLength(1);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });

  it("fails before creating a marker when DB row counts do not match", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-count-"));
    try {
      await expect(
        exportLiveSmokeEvidence(await createInput(exportRoot, fakeSql({ validationCount: 1 }))),
      ).rejects.toThrow("LIVE_SMOKE_EVIDENCE_COUNT_MISMATCH:validationEvidence");
      expect(await readdir(exportRoot)).toHaveLength(0);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });
});
