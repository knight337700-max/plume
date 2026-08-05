import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Sql } from "postgres";

export const LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION = "live-smoke-evidence-exporter-v3";
const FILES = [
  "run-summary.json",
  "budget-epoch.json",
  "spend-ledger.jsonl",
  "lifecycle.jsonl",
  "validation-evidence.jsonl",
  "coverage.jsonl",
  "failure.json",
  "spend-summary.json",
] as const;

async function writeFlushedFile(path: string, contents: string): Promise<void> {
  const handle = await open(path, "w");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

type JsonRecord = Readonly<Record<string, unknown>>;

export type EvidenceCounts = Readonly<{
  budgetEpoch: number;
  spendLedger: number;
  lifecycle: number;
  validationEvidence: number;
  coverage: number;
  failure: number;
  canary: number;
}>;

function validCount(value: unknown, key: keyof EvidenceCounts): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`LIVE_SMOKE_EVIDENCE_COUNT_INVALID:${key}`);
  return value;
}

export function mapEvidenceCounts(row: JsonRecord | undefined): EvidenceCounts {
  return {
    budgetEpoch: validCount(row?.budget_epoch, "budgetEpoch"),
    spendLedger: validCount(row?.spend_ledger, "spendLedger"),
    lifecycle: validCount(row?.lifecycle, "lifecycle"),
    validationEvidence: validCount(row?.validation_evidence, "validationEvidence"),
    coverage: validCount(row?.coverage, "coverage"),
    failure: validCount(row?.failure, "failure"),
    canary: validCount(row?.canary, "canary"),
  };
}

export interface LiveSmokeEvidenceExportInput {
  readonly sql: Sql;
  readonly exportRoot: string;
  readonly approvalId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId?: string;
  readonly scenarioId: string;
  readonly conservativeCarryForwardMicroUsd?: number;
  readonly exporterVersion?: string;
}

export interface LiveSmokeEvidenceExporterProbeInput {
  readonly sql: Sql;
  readonly exportRoot: string;
  readonly scenarioId: string;
}

export interface LiveSmokeEvidenceExporterProbeResult {
  readonly status: "READY";
  readonly canonicalArtifactsCreated: false;
  readonly exportAuditRows: 0;
  readonly usedActualRunIdentity: false;
  readonly fileCount: number;
  readonly probeHash: string;
}

export interface LiveSmokeEvidenceFinalExportInput extends LiveSmokeEvidenceExportInput {
  readonly workerWithSecretStopped: true;
  readonly additionalDispatchBlocked: true;
  readonly runTerminal: true;
  readonly ledgerStateStable: true;
}

export interface LiveSmokeEvidenceExportResult {
  readonly status: "COMPLETE";
  readonly created: boolean;
  readonly finalDirectory: string;
  readonly bundleHash: string;
  readonly manifestHash: string;
  readonly counts: EvidenceCounts;
}

function validateExporterInput(input: LiveSmokeEvidenceExportInput): void {
  if (!input.scenarioId.trim()) throw new Error("LIVE_SMOKE_EXPORT_SCENARIO_REQUIRED");
  if (
    input.conservativeCarryForwardMicroUsd !== undefined &&
    (!Number.isSafeInteger(input.conservativeCarryForwardMicroUsd) ||
      input.conservativeCarryForwardMicroUsd < 0)
  )
    throw new Error("LIVE_SMOKE_EXPORT_CARRY_FORWARD_INVALID");
  if (
    input.exporterVersion !== undefined &&
    input.exporterVersion !== LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION
  )
    throw new Error("LIVE_SMOKE_EXPORTER_VERSION_MISMATCH");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashIdentifier(value: string | null | undefined): string | null {
  return value ? sha256(value) : null;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function json(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function jsonl(rows: readonly JsonRecord[]): string {
  return rows.map((row) => JSON.stringify(stableValue(row))).join("\n") + (rows.length ? "\n" : "");
}

function safeSegment(value: string, label: string): string {
  if (!value || value.includes("..") || !/^[A-Za-z0-9._-]+$/u.test(value))
    throw new Error(`LIVE_SMOKE_EXPORT_${label}_INVALID`);
  return value;
}

function hashReservationRow(row: Record<string, unknown>): JsonRecord {
  return {
    reservationKeyHash: hashIdentifier(String(row.reservation_key)),
    state: row.state,
    billingPeriod: row.billing_period,
    reservedMicroUsd: row.reserved_micro_usd,
    settledMicroUsd: row.settled_micro_usd,
    model: row.model,
    pricingVersion: row.pricing_version,
    providerRequestIdHash: row.provider_request_id_hash ?? null,
    inputUnits: row.input_units,
    cachedInputUnits: row.cached_input_units,
    outputUnits: row.output_units,
  };
}

function hashEvidenceRow(row: Record<string, unknown>): JsonRecord {
  return {
    evidenceKeyHash: hashIdentifier(String(row.evidence_key)),
    evidenceStage: row.evidence_stage,
    verificationRunIdHash: hashIdentifier(row.verification_run_id as string | null),
    jobItemIdHash: hashIdentifier(String(row.job_item_id)),
    agentCode: row.agent_code,
    callKind: row.call_kind,
    sdkRequestAttempted: row.sdk_request_attempted,
    providerResponseReceived: row.provider_response_received,
    providerHttpStatus: row.provider_http_status,
    providerRequestIdHash: row.provider_request_id_hash ?? null,
    resolvedModel: row.resolved_model,
    jsonParseStatus: row.json_parse_status,
    transportValidationStatus: row.transport_validation_status,
    transportErrorCode: row.transport_error_code,
    transportErrorPaths: row.transport_error_paths,
    domainValidationStatus: row.domain_validation_status,
    domainErrorCode: row.domain_error_code,
    domainErrorPaths: row.domain_error_paths,
    repairEligible: row.repair_eligible,
    retryEligible: row.retry_eligible,
    coverageWriteAttempted: row.coverage_write_attempted,
    coverageWriteSucceeded: row.coverage_write_succeeded,
    coverageWriteErrorCode: row.coverage_write_error_code,
    inputUnits: row.input_units,
    cachedInputUnits: row.cached_input_units,
    outputUnits: row.output_units,
    outputFingerprint: row.output_fingerprint,
    outputLengthBytes: row.output_length_bytes,
  };
}

async function readSnapshot(input: LiveSmokeEvidenceExportInput) {
  const budgetEpochId = input.budgetEpochId ?? null;
  return input.sql.begin(async (transaction) => {
    const epoch = await transaction<JsonRecord[]>`
      SELECT workspace_id, smoke_run_id, budget_epoch_id, parent_budget_epoch_id,
             call_limit, used_units, status, reason, created_at, updated_at
      FROM live_smoke_budget_epoch
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY created_at, budget_epoch_id
    `;
    const policies = await transaction<JsonRecord[]>`
      SELECT budget_epoch_id, cached_input_micro_usd_per_million,
             max_estimated_input_tokens, per_run_soft_stop_micro_usd,
             per_run_hard_cap_micro_usd, monthly_limit_micro_usd,
             safety_buffer_micro_usd, absolute_provider_call_cap, billing_scope,
             created_at
      FROM live_smoke_budget_policy
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY created_at, budget_epoch_id
    `;
    const ledgers = await transaction<JsonRecord[]>`
      SELECT reservation_key, billing_period, state, reserved_micro_usd,
             settled_micro_usd, model, pricing_version, provider_request_id_hash,
             input_units, cached_input_units, output_units
      FROM live_smoke_spend_ledger
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY reservation_key
    `;
    const lifecycle = await transaction<JsonRecord[]>`
      SELECT reservation_key, agent_code, lifecycle_state, provider_mode,
             provider_request_sent, provider_response_received, billable_request_count,
             request_id_hash, input_units, output_units, terminal_error_code
      FROM live_smoke_reservation_lifecycle_event
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY reservation_key, lifecycle_state
    `;
    const validation = await transaction<JsonRecord[]>`
      SELECT evidence_key, evidence_stage, verification_run_id, job_item_id, agent_code,
             call_kind, sdk_request_attempted, provider_response_received, provider_http_status,
             provider_request_id_hash, resolved_model, json_parse_status,
             transport_validation_status, transport_error_code, transport_error_paths,
             domain_validation_status, domain_error_code, domain_error_paths,
             repair_eligible, retry_eligible, coverage_write_attempted,
             coverage_write_succeeded, coverage_write_error_code, input_units,
             cached_input_units, output_units, output_fingerprint, output_length_bytes
      FROM live_smoke_validation_evidence_event
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY evidence_key, evidence_stage
    `;
    const coverage = await transaction<JsonRecord[]>`
      SELECT verification_run_id, agent_code, provider, model, provider_request_sent,
             structured_output_passed, domain_validation_passed, request_id_hash,
             input_units, output_units, verified_at
      FROM agent_live_coverage
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY agent_code, verification_run_id
    `;
    const failures = await transaction<JsonRecord[]>`
      SELECT failure_key, verification_run_id, job_item_id, agent_code, call_kind,
             failure_class, stable_error_code, retryable, stage, synthetic_scenario_id,
             reservation_created, dispatch_started, sdk_attempted,
             provider_response_received, usage_present, settlement_state,
             validation_stage, schema_error_paths
      FROM live_smoke_failure_evidence_event
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY failure_key
    `;
    const canary = await transaction<JsonRecord[]>`
      SELECT verification_run_id, status, provider_request_sent,
             provider_response_received, http_200, resolved_model,
             strict_output_valid, domain_validation_valid, store_disabled,
             background_disabled, tools_unused, error_code
      FROM live_smoke_provider_canary
      WHERE smoke_run_id = ${input.smokeRunId}
        AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)
      ORDER BY verification_run_id
    `;
    const adjustments = await transaction<JsonRecord[]>`
      SELECT billing_scope, billing_period_utc, source_approval_id, reason_code,
             conservative_micro_usd, represents_actual_cost
      FROM live_smoke_reconciliation_adjustments
      WHERE source_approval_id = ${input.approvalId}
      ORDER BY billing_scope, billing_period_utc, adjustment_key
    `;
    const counts = await transaction<JsonRecord[]>`
      SELECT
        (SELECT count(*)::int FROM live_smoke_budget_epoch WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS budget_epoch,
        (SELECT count(*)::int FROM live_smoke_spend_ledger WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS spend_ledger,
        (SELECT count(*)::int FROM live_smoke_reservation_lifecycle_event WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS lifecycle,
        (SELECT count(*)::int FROM live_smoke_validation_evidence_event WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS validation_evidence,
        (SELECT count(*)::int FROM agent_live_coverage WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS coverage,
        (SELECT count(*)::int FROM live_smoke_failure_evidence_event WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS failure,
        (SELECT count(*)::int FROM live_smoke_provider_canary WHERE smoke_run_id = ${input.smokeRunId} AND (${budgetEpochId}::uuid IS NULL OR budget_epoch_id = ${budgetEpochId}::uuid)) AS canary
    `;
    return {
      epoch,
      policies,
      ledgers,
      lifecycle,
      validation,
      coverage,
      failures,
      canary,
      adjustments,
      counts: mapEvidenceCounts(counts[0]),
    };
  });
}

function bundleFiles(
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  input: LiveSmokeEvidenceExportInput,
) {
  const ledgers = snapshot.ledgers.map((row) => hashReservationRow(row));
  const lifecycle = snapshot.lifecycle.map((row) => ({
    reservationKeyHash: hashIdentifier(String(row.reservation_key)),
    agentCode: row.agent_code,
    lifecycleState: row.lifecycle_state,
    providerMode: row.provider_mode,
    providerRequestSent: row.provider_request_sent,
    providerResponseReceived: row.provider_response_received,
    billableRequestCount: row.billable_request_count,
    providerRequestIdHash: row.request_id_hash ?? null,
    inputUnits: row.input_units,
    outputUnits: row.output_units,
    terminalErrorCode: row.terminal_error_code,
  }));
  const validation = snapshot.validation.map((row) => hashEvidenceRow(row));
  const coverage = snapshot.coverage.map((row) => ({
    verificationRunIdHash: hashIdentifier(String(row.verification_run_id)),
    agentCode: row.agent_code,
    provider: row.provider,
    model: row.model,
    providerRequestSent: row.provider_request_sent,
    structuredOutputPassed: row.structured_output_passed,
    domainValidationPassed: row.domain_validation_passed,
    providerRequestIdHash: row.request_id_hash,
    inputUnits: row.input_units,
    outputUnits: row.output_units,
    verifiedAt: row.verified_at,
  }));
  const failures = snapshot.failures.map((row) => ({
    failureKeyHash: hashIdentifier(String(row.failure_key)),
    verificationRunIdHash: hashIdentifier(row.verification_run_id as string | null),
    jobItemIdHash: hashIdentifier(String(row.job_item_id)),
    agentCode: row.agent_code,
    callKind: row.call_kind,
    failureClass: row.failure_class,
    stableErrorCode: row.stable_error_code,
    retryable: row.retryable,
    stage: row.stage,
    syntheticScenarioId: row.synthetic_scenario_id,
    reservationCreated: row.reservation_created,
    dispatchStarted: row.dispatch_started,
    sdkAttempted: row.sdk_attempted,
    providerResponseReceived: row.provider_response_received,
    usagePresent: row.usage_present,
    settlementState: row.settlement_state,
    validationStage: row.validation_stage,
    schemaErrorPaths: row.schema_error_paths,
  }));
  const epoch = snapshot.epoch.map((row) => ({
    workspaceIdHash: hashIdentifier(String(row.workspace_id)),
    smokeRunIdHash: hashIdentifier(String(row.smoke_run_id)),
    budgetEpochIdHash: hashIdentifier(String(row.budget_epoch_id)),
    parentBudgetEpochIdHash: hashIdentifier(row.parent_budget_epoch_id as string | null),
    callLimit: row.call_limit,
    usedUnits: row.used_units,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const budgetEpoch = {
    epochs: epoch,
    policies: snapshot.policies.map((row) => ({
      ...row,
      budget_epoch_id: hashIdentifier(String(row.budget_epoch_id)),
    })),
  };
  const spendSummary = {
    reservedMicroUsd: ledgers.reduce((sum, row) => sum + Number(row.reservedMicroUsd ?? 0), 0),
    settledMicroUsd: ledgers.reduce((sum, row) => sum + Number(row.settledMicroUsd ?? 0), 0),
    unknownBillableRows: ledgers.filter((row) => row.state === "UNKNOWN_BILLABLE").length,
    conservativeCarryForwardMicroUsd: input.conservativeCarryForwardMicroUsd ?? 0,
    carryForwardRepresentsActualCost: false,
    providerRequestIdHashes: ledgers.filter((row) => row.providerRequestIdHash).length,
  };
  const runSummary = {
    exporterVersion: LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION,
    approvalId: input.approvalId,
    smokeRunIdHash: hashIdentifier(input.smokeRunId),
    budgetEpochIdHash: hashIdentifier(input.budgetEpochId),
    scenarioId: input.scenarioId,
    counts: snapshot.counts,
    canary: snapshot.canary.map((row) => ({
      verificationRunIdHash: hashIdentifier(String(row.verification_run_id)),
      status: row.status,
      providerRequestSent: row.provider_request_sent,
      providerResponseReceived: row.provider_response_received,
      http200: row.http_200,
      resolvedModel: row.resolved_model,
      strictOutputValid: row.strict_output_valid,
      domainValidationValid: row.domain_validation_valid,
      storeDisabled: row.store_disabled,
      backgroundDisabled: row.background_disabled,
      toolsUnused: row.tools_unused,
      errorCode: row.error_code,
    })),
  };
  return new Map<string, string>([
    ["run-summary.json", json(runSummary)],
    ["budget-epoch.json", json(budgetEpoch)],
    ["spend-ledger.jsonl", jsonl(ledgers)],
    ["lifecycle.jsonl", jsonl(lifecycle)],
    ["validation-evidence.jsonl", jsonl(validation)],
    ["coverage.jsonl", jsonl(coverage)],
    ["failure.json", json(failures)],
    ["spend-summary.json", json(spendSummary)],
    ["reconciliation-adjustments.json", json(snapshot.adjustments)],
  ]);
}

function assertSnapshotCounts(snapshot: Awaited<ReturnType<typeof readSnapshot>>): void {
  const expected: Readonly<Record<string, number>> = {
    budgetEpoch: snapshot.epoch.length,
    spendLedger: snapshot.ledgers.length,
    lifecycle: snapshot.lifecycle.length,
    validationEvidence: snapshot.validation.length,
    coverage: snapshot.coverage.length,
    failure: snapshot.failures.length,
    canary: snapshot.canary.length,
  };
  for (const key of Object.keys(expected) as (keyof EvidenceCounts)[]) {
    const value = expected[key];
    if (snapshot.counts[key] !== value)
      throw new Error(`LIVE_SMOKE_EVIDENCE_COUNT_MISMATCH:${key}`);
  }
}

export async function probeLiveSmokeEvidenceExporterReadiness(
  input: LiveSmokeEvidenceExporterProbeInput,
): Promise<LiveSmokeEvidenceExporterProbeResult> {
  if (!input.scenarioId.trim()) throw new Error("LIVE_SMOKE_EXPORT_SCENARIO_REQUIRED");
  const probeRoot = resolve(input.exportRoot);
  await mkdir(probeRoot, { recursive: true });
  const probeInput: LiveSmokeEvidenceExportInput = {
    sql: input.sql,
    exportRoot: probeRoot,
    approvalId: `probe-${randomUUID()}`,
    smokeRunId: randomUUID(),
    scenarioId: input.scenarioId,
    exporterVersion: LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION,
  };
  const snapshot = await readSnapshot(probeInput);
  assertSnapshotCounts(snapshot);
  const files = bundleFiles(snapshot, probeInput);
  const temporaryDirectory = await mkdtemp(join(probeRoot, `.probe-${randomUUID()}-`));
  try {
    for (const [name, contents] of files) {
      const path = join(temporaryDirectory, name);
      await writeFlushedFile(path, contents);
      await access(path);
    }
    const probeHash = sha256(
      [...files.entries()].map(([name, contents]) => `${name}:${sha256(contents)}`).join("\n"),
    );
    return {
      status: "READY",
      canonicalArtifactsCreated: false,
      exportAuditRows: 0,
      usedActualRunIdentity: false,
      fileCount: files.size,
      probeHash,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function exportFinalLiveSmokeEvidence(
  input: LiveSmokeEvidenceFinalExportInput,
): Promise<LiveSmokeEvidenceExportResult> {
  validateExporterInput(input);
  if (input.workerWithSecretStopped !== true)
    throw new Error("LIVE_SMOKE_FINAL_EXPORT_WORKER_NOT_STOPPED");
  if (input.additionalDispatchBlocked !== true)
    throw new Error("LIVE_SMOKE_FINAL_EXPORT_DISPATCH_NOT_BLOCKED");
  if (input.runTerminal !== true)
    throw new Error("LIVE_SMOKE_FINAL_EXPORT_TERMINAL_STATE_REQUIRED");
  if (input.ledgerStateStable !== true)
    throw new Error("LIVE_SMOKE_FINAL_EXPORT_LEDGER_NOT_STABLE");
  const approvalId = safeSegment(input.approvalId, "APPROVAL_ID");
  const smokeRunId = safeSegment(input.smokeRunId, "SMOKE_RUN_ID");
  const finalDirectory = resolve(input.exportRoot, approvalId, smokeRunId);
  const parentDirectory = resolve(input.exportRoot, approvalId);
  const snapshot = await readSnapshot(input);
  assertSnapshotCounts(snapshot);
  const files = bundleFiles(snapshot, input);
  const fileHashes = Object.fromEntries(
    [...files.entries()].map(([name, contents]) => [name, sha256(contents)]),
  );
  const bundleHash = sha256(
    FILES.map((name) => `${name}:${fileHashes[name]}`)
      .concat(
        `reconciliation-adjustments.json:${sha256(files.get("reconciliation-adjustments.json")!)}`,
      )
      .join("\n"),
  );
  const manifest = {
    exporterVersion: LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION,
    approvalId,
    smokeRunIdHash: hashIdentifier(input.smokeRunId),
    bundleHash,
    files: {
      ...fileHashes,
      "reconciliation-adjustments.json": sha256(files.get("reconciliation-adjustments.json")!),
    },
    counts: snapshot.counts,
    exportStatus: "COMPLETE",
  } as const;
  const manifestContents = json(manifest);
  const manifestHash = sha256(manifestContents);
  const allFiles = new Map(files);
  allFiles.set("manifest.json", manifestContents);
  allFiles.set("manifest.sha256", `${manifestHash}\n`);

  const recordExportAudit = async (): Promise<void> => {
    const audit = await input.sql`
      INSERT INTO live_smoke_evidence_exports
        (approval_id, smoke_run_id, budget_epoch_id, bundle_hash, exporter_version, export_status)
      VALUES
        (${approvalId}, ${input.smokeRunId}, ${input.budgetEpochId ?? null}, ${bundleHash},
         ${LIVE_SMOKE_EVIDENCE_EXPORTER_VERSION}, 'COMPLETE')
      ON CONFLICT (approval_id, smoke_run_id) DO NOTHING
      RETURNING export_id
    `;
    if (audit.length === 0) {
      const existing = await input.sql<{ bundle_hash: string }[]>`
        SELECT bundle_hash FROM live_smoke_evidence_exports
        WHERE approval_id = ${approvalId} AND smoke_run_id = ${input.smokeRunId}
      `;
      if (existing[0]?.bundle_hash !== bundleHash)
        throw new Error("LIVE_SMOKE_EVIDENCE_AUDIT_CONFLICT");
    }
  };

  try {
    await access(join(finalDirectory, "EXPORT_COMPLETE"));
    const existingManifest = JSON.parse(
      await readFile(join(finalDirectory, "manifest.json"), "utf8"),
    ) as { bundleHash?: string };
    if (existingManifest.bundleHash !== bundleHash)
      throw new Error("LIVE_SMOKE_EVIDENCE_EXPORT_CONFLICT");
    await recordExportAudit();
    return {
      status: "COMPLETE",
      created: false,
      finalDirectory,
      bundleHash,
      manifestHash,
      counts: snapshot.counts,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "LIVE_SMOKE_EVIDENCE_EXPORT_CONFLICT")
      throw error;
  }

  const temporaryDirectory = join(parentDirectory, `.pending-${smokeRunId}-${randomUUID()}`);
  await mkdir(temporaryDirectory, { recursive: true });
  try {
    for (const [name, contents] of allFiles)
      await writeFlushedFile(join(temporaryDirectory, name), contents);
    await mkdir(parentDirectory, { recursive: true });
    await rename(temporaryDirectory, finalDirectory);
    await writeFlushedFile(join(finalDirectory, "EXPORT_COMPLETE"), "EXPORT_COMPLETE\n");
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  await recordExportAudit();
  return {
    status: "COMPLETE",
    created: true,
    finalDirectory,
    bundleHash,
    manifestHash,
    counts: snapshot.counts,
  };
}
