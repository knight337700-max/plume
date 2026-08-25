import postgres, { type Sql } from "postgres";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// This integration fixture must load generated schemas before the contracts package is built in CI.
// eslint-disable-next-line no-restricted-imports
import { agentSchemas } from "../../../contracts/src/index.js";
import {
  LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
  type AgentProviderGateway,
} from "@plume/core/src/public.js";
import {
  createLiveSmokeProviderCanaryHandler,
  createLiveSmokeVerificationHandler,
} from "../../../../apps/worker/src/handlers/ai/live-smoke.js";
import {
  PostgresLiveSmokeBudgetStore,
  type LiveSmokeBudgetStore,
} from "./live-smoke-budget-store.js";
import { PostgresLiveSmokeCoverageStore } from "./live-smoke-coverage-store.js";
import { PostgresLiveSmokeLifecycleStore } from "./live-smoke-lifecycle-store.js";
import { PostgresLiveSmokeValidationEvidenceStore } from "./live-smoke-validation-evidence-store.js";
import {
  exportFinalLiveSmokeEvidence,
  probeLiveSmokeEvidenceExporterReadiness,
} from "./live-smoke-evidence-exporter.js";

const enabled = process.env.RUN_GATE_I_B5_POSTGRES_TEST === "true";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";

const policy = {
  cachedInputMicroUsdPerMillionTokens: 100_000,
  maxEstimatedInputTokens: 250_000,
  perRunSoftStopMicroUsd: 250_000,
  perRunHardCapMicroUsd: 750_000,
  monthlyLimitMicroUsd: 5_000_000,
  safetyBufferMicroUsd: 250_000,
  absoluteProviderCallCap: 4,
  billingScope: "gate-i-phase-2-5c-b5-integration",
} as const;

const pricingPolicy = {
  model: "gpt-5.6-luna",
  pricingVersion: "openai-gpt-5.6-luna-standard-2026-08-03",
  inputMicroUsdPerMillionTokens: 1_000_000,
  outputMicroUsdPerMillionTokens: 6_000_000,
  cachedInputMicroUsdPerMillionTokens: 100_000,
  maxEstimatedInputTokens: 250_000,
  perRunSoftStopMicroUsd: 250_000,
  perRunHardCapMicroUsd: 750_000,
  monthlyLimitMicroUsd: 5_000_000,
  safetyBufferMicroUsd: 250_000,
  absoluteProviderCallCap: 4,
  billingScope: policy.billingScope,
} as const;

function minimalTransport(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0)
    return minimalTransport(schema.anyOf[0] as Record<string, unknown>);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, minimalTransport(value)]),
    );
  }
  if (type === "array") return [];
  if (type === "string") return "synthetic";
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return false;
  return null;
}

function fakeProviderGateway(callCounter: { value: number }): AgentProviderGateway {
  return {
    async execute(request) {
      callCounter.value += 1;
      await request.onSdkRequestAttempt?.();
      const agentCode = request.metadata.agentCode;
      const outputJson =
        agentCode === "PROVIDER_ACCESSIBILITY_CANARY"
          ? { status: "ok", environment: "staging", provider: "openai" }
          : minimalTransport(
              (agentSchemas as Readonly<Record<string, unknown>>)[
                "campaign-analysis-result.schema.json"
              ] as Record<string, unknown>,
            );
      return {
        status: "COMPLETED" as const,
        model: "gpt-5.6-luna",
        httpStatus: 200,
        outputJson,
        latencyMs: 1,
        usage: { inputUnits: 12, outputUnits: 8 },
        providerRequestIdHash: `${String(callCounter.value).padStart(64, "0")}`,
        evidence: {
          requestAttempted: true,
          responseReceived: true,
          httpStatus: 200,
          requestIdHash: `${String(callCounter.value).padStart(64, "0")}`,
          resolvedModel: "gpt-5.6-luna",
          jsonParseStatus: "PASS" as const,
        },
      };
    },
  };
}

function job(id: string, data: Record<string, unknown>) {
  return { id, attemptsMade: 0, data } as never;
}

function invocation(
  workspaceId: string,
  smokeRunId: string,
  budgetEpochId: string,
  jobItemId: string,
) {
  return { workspaceId, smokeRunId, budgetEpochId, jobItemId };
}

async function createEpoch(
  budget: LiveSmokeBudgetStore,
  input: { workspaceId: string; smokeRunId: string; budgetEpochId: string },
): Promise<void> {
  await budget.createEpoch({
    ...input,
    limit: 4,
    reason: "gate-i-phase-2-5c-b5-postgres-integration",
    policy,
  });
}

describe.skipIf(!enabled)("Gate I Phase 2.5C-B.5 durable live evidence flow", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(databaseUrl, { max: 8, onnotice: () => undefined });
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("probes, records canary and coverage, then exports one terminal bundle", async () => {
    const workspaceId = randomUUID();
    const smokeRunId = randomUUID();
    const budgetEpochId = randomUUID();
    const canaryVerificationRunId = randomUUID();
    const campaignVerificationRunId = randomUUID();
    const parentWorkflowJobId = randomUUID();
    const canaryJobItemId = randomUUID();
    const campaignJobItemId = randomUUID();
    const approvalId = `PLUME-GATE-I-2.5C-B5-${randomUUID()}`;
    const budget = new PostgresLiveSmokeBudgetStore(sql);
    const lifecycle = new PostgresLiveSmokeLifecycleStore(sql);
    const coverage = new PostgresLiveSmokeCoverageStore(sql);
    const validation = new PostgresLiveSmokeValidationEvidenceStore(sql);
    const calls = { value: 0 };
    const gateway = fakeProviderGateway(calls);
    const exportRoot = await mkdtemp(join(tmpdir(), "plume-gate-i-b5-terminal-"));

    try {
      await createEpoch(budget, { workspaceId, smokeRunId, budgetEpochId });
      const probe = await probeLiveSmokeEvidenceExporterReadiness({
        sql,
        exportRoot,
        scenarioId: "CANARY_PLUS_CAMPAIGN_ANALYST_DIAGNOSTIC_V1",
      });
      expect(probe).toMatchObject({
        status: "READY",
        canonicalArtifactsCreated: false,
        exportAuditRows: 0,
        usedActualRunIdentity: false,
      });
      expect(await readdir(exportRoot)).toEqual([]);

      const canary = createLiveSmokeProviderCanaryHandler(gateway, budget, lifecycle, {
        providerMode: "live",
        pricingPolicy,
      });
      await canary(
        job(canaryJobItemId, {
          canary: true,
          verificationRunId: canaryVerificationRunId,
          parentWorkflowJobId,
          workspaceId,
          smokeRunId,
          budgetEpochId,
          workflowCallBudget: 4,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        }),
        invocation(workspaceId, smokeRunId, budgetEpochId, canaryJobItemId),
      );
      await expect(
        lifecycle.ensureCanary({
          verificationRunId: canaryVerificationRunId,
          workspaceId,
          smokeRunId,
          budgetEpochId,
        }),
      ).resolves.toEqual({ created: false, scopeMatches: true, status: "PASS" });
      await expect(
        lifecycle.ensureCanary({
          verificationRunId: canaryVerificationRunId,
          workspaceId: randomUUID(),
          smokeRunId,
          budgetEpochId,
        }),
      ).rejects.toThrow("LIVE_SMOKE_CANARY_SCOPE_CONFLICT");

      await coverage.createVerificationRun({
        verificationRunId: campaignVerificationRunId,
        workspaceId,
        smokeRunId,
        budgetEpochId,
        parentWorkflowJobId,
        idempotencyKey: `campaign-${campaignVerificationRunId}`,
      });
      const verify = createLiveSmokeVerificationHandler(gateway, budget, coverage, {
        providerMode: "live",
        pricingPolicy,
        lifecycleStore: lifecycle,
        validationEvidenceStore: validation,
      });
      await verify(
        job(campaignJobItemId, {
          verificationOnly: true,
          verificationRunId: campaignVerificationRunId,
          canaryVerificationRunId,
          parentWorkflowJobId,
          agentCode: "CAMPAIGN_ANALYST",
          workspaceId,
          smokeRunId,
          budgetEpochId,
          workflowCallBudget: 4,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        }),
        invocation(workspaceId, smokeRunId, budgetEpochId, campaignJobItemId),
      );

      expect(calls.value).toBe(2);
      const rows = await sql<
        {
          canary: number;
          coverage: number;
          ledger: number;
          validation: number;
          coverageWrite: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM live_smoke_provider_canary
           WHERE smoke_run_id = ${smokeRunId} AND budget_epoch_id = ${budgetEpochId}) AS canary,
          (SELECT count(*)::int FROM agent_live_coverage
           WHERE smoke_run_id = ${smokeRunId} AND budget_epoch_id = ${budgetEpochId}) AS coverage,
          (SELECT count(*)::int FROM live_smoke_spend_ledger
           WHERE smoke_run_id = ${smokeRunId} AND budget_epoch_id = ${budgetEpochId}) AS ledger,
          (SELECT count(*)::int FROM live_smoke_validation_evidence_event
           WHERE smoke_run_id = ${smokeRunId} AND budget_epoch_id = ${budgetEpochId}) AS validation,
          (SELECT count(*)::int FROM live_smoke_validation_evidence_event
           WHERE smoke_run_id = ${smokeRunId} AND budget_epoch_id = ${budgetEpochId}
             AND evidence_stage = 'COVERAGE_WRITE') AS "coverageWrite"
      `;
      expect(rows[0]).toEqual({
        canary: 1,
        coverage: 1,
        ledger: 2,
        validation: 4,
        coverageWrite: 1,
      });

      expect(await readdir(exportRoot)).toEqual([]);
      const first = await exportFinalLiveSmokeEvidence({
        sql,
        exportRoot,
        approvalId,
        smokeRunId,
        budgetEpochId,
        scenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        workerWithSecretStopped: true,
        additionalDispatchBlocked: true,
        runTerminal: true,
        ledgerStateStable: true,
      });
      expect(first).toMatchObject({
        status: "COMPLETE",
        created: true,
        counts: {
          budgetEpoch: 1,
          spendLedger: 2,
          coverage: 1,
          canary: 1,
        },
      });
      expect(await readFile(join(first.finalDirectory, "EXPORT_COMPLETE"), "utf8")).toBe(
        "EXPORT_COMPLETE\n",
      );
      expect(
        JSON.parse(await readFile(join(first.finalDirectory, "manifest.json"), "utf8")),
      ).toMatchObject({ exporterVersion: "live-smoke-evidence-exporter-v3" });
      const replay = await exportFinalLiveSmokeEvidence({
        sql,
        exportRoot,
        approvalId,
        smokeRunId,
        budgetEpochId,
        scenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        workerWithSecretStopped: true,
        additionalDispatchBlocked: true,
        runTerminal: true,
        ledgerStateStable: true,
      });
      expect(replay).toMatchObject({ created: false, bundleHash: first.bundleHash });
      expect(calls.value).toBe(2);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  });

  it("classifies coverage write failure without retry or repair", async () => {
    const workspaceId = randomUUID();
    const smokeRunId = randomUUID();
    const budgetEpochId = randomUUID();
    const canaryVerificationRunId = randomUUID();
    const campaignVerificationRunId = randomUUID();
    const parentWorkflowJobId = randomUUID();
    const canaryJobItemId = randomUUID();
    const campaignJobItemId = randomUUID();
    const budget = new PostgresLiveSmokeBudgetStore(sql);
    const lifecycle = new PostgresLiveSmokeLifecycleStore(sql);
    const realCoverage = new PostgresLiveSmokeCoverageStore(sql);
    const validation = new PostgresLiveSmokeValidationEvidenceStore(sql);
    const calls = { value: 0 };
    const gateway = fakeProviderGateway(calls);

    await createEpoch(budget, { workspaceId, smokeRunId, budgetEpochId });
    const canary = createLiveSmokeProviderCanaryHandler(gateway, budget, lifecycle, {
      providerMode: "live",
      pricingPolicy,
    });
    await canary(
      job(canaryJobItemId, {
        canary: true,
        verificationRunId: canaryVerificationRunId,
        parentWorkflowJobId,
        workspaceId,
        smokeRunId,
        budgetEpochId,
        workflowCallBudget: 4,
        syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      }),
      invocation(workspaceId, smokeRunId, budgetEpochId, canaryJobItemId),
    );
    await realCoverage.createVerificationRun({
      verificationRunId: campaignVerificationRunId,
      workspaceId,
      smokeRunId,
      budgetEpochId,
      parentWorkflowJobId,
      idempotencyKey: `coverage-fault-${campaignVerificationRunId}`,
    });
    const failingCoverage = {
      createVerificationRun: realCoverage.createVerificationRun.bind(realCoverage),
      async recordCoverage() {
        throw new Error("SYNTHETIC_COVERAGE_STORE_FAILURE");
      },
      listCoverage: realCoverage.listCoverage.bind(realCoverage),
    };
    const verify = createLiveSmokeVerificationHandler(gateway, budget, failingCoverage, {
      providerMode: "live",
      pricingPolicy,
      lifecycleStore: lifecycle,
      validationEvidenceStore: validation,
    });
    await expect(
      verify(
        job(campaignJobItemId, {
          verificationOnly: true,
          verificationRunId: campaignVerificationRunId,
          canaryVerificationRunId,
          parentWorkflowJobId,
          agentCode: "CAMPAIGN_ANALYST",
          workspaceId,
          smokeRunId,
          budgetEpochId,
          workflowCallBudget: 4,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        }),
        invocation(workspaceId, smokeRunId, budgetEpochId, campaignJobItemId),
      ),
    ).rejects.toThrow("SYNTHETIC_COVERAGE_STORE_FAILURE");
    expect(calls.value).toBe(2);
    const evidence = await sql<
      {
        coverage_write_succeeded: boolean;
        coverage_write_error_code: string | null;
      }[]
    >`
      SELECT coverage_write_succeeded, coverage_write_error_code
      FROM live_smoke_validation_evidence_event
      WHERE smoke_run_id = ${smokeRunId}
        AND budget_epoch_id = ${budgetEpochId}
        AND evidence_stage = 'COVERAGE_WRITE'
    `;
    expect(evidence).toEqual([
      { coverage_write_succeeded: false, coverage_write_error_code: "COVERAGE_WRITE_FAILED" },
    ]);
  });
});
