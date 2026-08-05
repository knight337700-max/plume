import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import {
  exportFinalLiveSmokeEvidence,
  probeLiveSmokeEvidenceExporterReadiness,
  mapEvidenceCounts,
  type LiveSmokeEvidenceFinalExportInput,
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
    budget_epoch: 0,
    spend_ledger: 0,
    lifecycle: 0,
    validation_evidence: options?.validationCount ?? 0,
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

describe("evidence count mapping", () => {
  it("maps one epoch and zero provider evidence to canonical keys", () => {
    expect(
      mapEvidenceCounts({
        budget_epoch: 1,
        spend_ledger: 0,
        lifecycle: 0,
        validation_evidence: 0,
        coverage: 0,
        failure: 0,
        canary: 0,
      }),
    ).toEqual({
      budgetEpoch: 1,
      spendLedger: 0,
      lifecycle: 0,
      validationEvidence: 0,
      coverage: 0,
      failure: 0,
      canary: 0,
    });
  });

  it("maps all non-zero counts without coercion", () => {
    expect(
      mapEvidenceCounts({
        budget_epoch: 1,
        spend_ledger: 2,
        lifecycle: 3,
        validation_evidence: 4,
        coverage: 5,
        failure: 6,
        canary: 7,
      }),
    ).toEqual({
      budgetEpoch: 1,
      spendLedger: 2,
      lifecycle: 3,
      validationEvidence: 4,
      coverage: 5,
      failure: 6,
      canary: 7,
    });
  });

  it.each([
    ["missing", {}],
    ["null", { budget_epoch: null }],
    ["string", { budget_epoch: "1" }],
    ["negative", { budget_epoch: -1 }],
    ["fraction", { budget_epoch: 1.5 }],
    ["unsafe integer", { budget_epoch: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects %s values", (_label, value) => {
    expect(() => mapEvidenceCounts(value)).toThrow("LIVE_SMOKE_EVIDENCE_COUNT_INVALID:budgetEpoch");
  });
});

async function createInput(
  exportRoot: string,
  sql: Sql,
): Promise<LiveSmokeEvidenceFinalExportInput> {
  return {
    sql,
    exportRoot,
    approvalId: "PLUME-GATE-I-2.5C-B-DIAG-54DF7982-20260804-R4",
    smokeRunId: "smoke-run-1",
    budgetEpochId: "epoch-1",
    scenarioId: "CANARY_PLUS_CAMPAIGN_ANALYST_DIAGNOSTIC_V1",
    conservativeCarryForwardMicroUsd: 1_500_000,
    workerWithSecretStopped: true,
    additionalDispatchBlocked: true,
    runTerminal: true,
    ledgerStateStable: true,
  };
}

describe("redacted live evidence export", () => {
  it("probes readiness without creating a canonical bundle or export audit", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-probe-"));
    try {
      const result = await probeLiveSmokeEvidenceExporterReadiness({
        sql: fakeSql(),
        exportRoot,
        scenarioId: "CANARY_PLUS_CAMPAIGN_ANALYST_DIAGNOSTIC_V1",
      });
      expect(result).toMatchObject({
        status: "READY",
        canonicalArtifactsCreated: false,
        exportAuditRows: 0,
        usedActualRunIdentity: false,
      });
      expect(await readdir(exportRoot)).toEqual([]);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });

  it("writes the complete bundle and returns created=false on an idempotent replay", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-"));
    try {
      const sql = fakeSql();
      const input = await createInput(exportRoot, sql);
      const first = await exportFinalLiveSmokeEvidence(input);
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
      const second = await exportFinalLiveSmokeEvidence(input);
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

  it("accepts an existing v2 bundle during an idempotent recovery replay", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-v2-replay-"));
    try {
      const input = await createInput(exportRoot, fakeSql());
      const first = await exportFinalLiveSmokeEvidence(input);
      const manifestPath = join(first.finalDirectory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        exporterVersion: string;
        bundleHash: string;
      };
      await writeFile(
        manifestPath,
        `${JSON.stringify({ ...manifest, exporterVersion: "live-smoke-evidence-exporter-v2" }, null, 2)}\n`,
        "utf8",
      );

      await expect(exportFinalLiveSmokeEvidence(input)).resolves.toMatchObject({
        status: "COMPLETE",
        created: false,
        bundleHash: first.bundleHash,
      });
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });

  it("fails before creating a marker when DB row counts do not match", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-count-"));
    try {
      await expect(
        exportFinalLiveSmokeEvidence(
          await createInput(exportRoot, fakeSql({ validationCount: 1 })),
        ),
      ).rejects.toThrow("LIVE_SMOKE_EVIDENCE_COUNT_MISMATCH:validationEvidence");
      expect(await readdir(exportRoot)).toHaveLength(0);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when final terminal preconditions are absent", async () => {
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-live-evidence-terminal-"));
    try {
      const input = await createInput(exportRoot, fakeSql());
      await expect(
        exportFinalLiveSmokeEvidence({ ...input, runTerminal: false as never }),
      ).rejects.toThrow("LIVE_SMOKE_FINAL_EXPORT_TERMINAL_STATE_REQUIRED");
      expect(await readdir(exportRoot)).toEqual([]);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });
});
