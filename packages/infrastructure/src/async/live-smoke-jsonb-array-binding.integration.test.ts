import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresLiveSmokeFailureEvidenceStore } from "./live-smoke-failure-evidence-store.js";
import { PostgresLiveSmokeValidationEvidenceStore } from "./live-smoke-validation-evidence-store.js";

const enabled = process.env.RUN_GATE_I_B6_POSTGRES_TEST === "true";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";

function validationInput(overrides: Record<string, unknown> = {}) {
  return {
    evidenceKey: `b6-validation-${randomUUID()}`,
    evidenceStage: "SDK_ATTEMPT" as const,
    workspaceId: randomUUID(),
    smokeRunId: randomUUID(),
    budgetEpochId: randomUUID(),
    jobItemId: randomUUID(),
    agentCode: "CAMPAIGN_ANALYST",
    callKind: "initial" as const,
    sdkRequestAttempted: false,
    providerResponseReceived: false,
    jsonParseStatus: "NOT_REACHED" as const,
    transportValidationStatus: "NOT_REACHED" as const,
    domainValidationStatus: "NOT_REACHED" as const,
    repairEligible: false,
    retryEligible: false,
    coverageWriteAttempted: false,
    coverageWriteSucceeded: false,
    ...overrides,
  };
}

function failureInput(overrides: Record<string, unknown> = {}) {
  return {
    failureKey: `b6-failure-${randomUUID()}`,
    workspaceId: randomUUID(),
    smokeRunId: randomUUID(),
    budgetEpochId: randomUUID(),
    jobItemId: randomUUID(),
    agentCode: "CAMPAIGN_ANALYST",
    callKind: "initial" as const,
    failureClass: "EVIDENCE_WRITE" as const,
    stableErrorCode: "EVIDENCE_STORE_ARRAY_JSON_BINDING_FAILED",
    retryable: false,
    stage: "EVIDENCE" as const,
    syntheticScenarioId: "SYNTHETIC_JACOMO_KAKAO_BIZBOARD_2026_1",
    reservationCreated: true,
    dispatchStarted: true,
    sdkAttempted: false,
    providerResponseReceived: false,
    usagePresent: false,
    settlementState: "UNKNOWN_BILLABLE",
    ...overrides,
  };
}

describe.skipIf(!enabled)("Gate I Phase 2.5C-B.6 PostgreSQL JSONB array binding", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(databaseUrl, { max: 4, onnotice: () => undefined });
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("stores validation and failure redacted arrays as JSONB strings", async () => {
    const validation = new PostgresLiveSmokeValidationEvidenceStore(sql);
    const failure = new PostgresLiveSmokeFailureEvidenceStore(sql);
    const emptyValidation = validationInput({
      evidenceKey: `b6-validation-empty-${randomUUID()}`,
      transportErrorPaths: Object.freeze([]),
      domainErrorPaths: Object.freeze([]),
    });
    const nonEmptyValidation = validationInput({
      evidenceKey: `b6-validation-non-empty-${randomUUID()}`,
      transportErrorPaths: Object.freeze([
        "$.campaign.name",
        "$.brief.objective",
        "$.campaign.name",
      ]),
      domainErrorPaths: Object.freeze(["$.output.headline"]),
    });
    const emptyFailure = failureInput({
      failureKey: `b6-failure-empty-${randomUUID()}`,
      schemaErrorPaths: Object.freeze([]),
    });
    const nonEmptyFailure = failureInput({
      failureKey: `b6-failure-non-empty-${randomUUID()}`,
      schemaErrorPaths: Object.freeze(["$.schema.one", "not-allowed", "$.schema.one"]),
    });

    expect(await validation.record(emptyValidation)).toEqual({ inserted: true });
    expect(await validation.record(nonEmptyValidation)).toEqual({ inserted: true });
    expect(await validation.record(nonEmptyValidation)).toEqual({ inserted: false });
    expect(await failure.record(emptyFailure)).toEqual({ inserted: true });
    expect(await failure.record(nonEmptyFailure)).toEqual({ inserted: true });
    expect(await failure.record(nonEmptyFailure)).toEqual({ inserted: false });

    const validationRows = await sql<
      { transport_error_paths: unknown; domain_error_paths: unknown }[]
    >`
      SELECT transport_error_paths, domain_error_paths
      FROM live_smoke_validation_evidence_event
      WHERE evidence_key IN (${emptyValidation.evidenceKey}, ${nonEmptyValidation.evidenceKey})
      ORDER BY evidence_key
    `;
    expect(validationRows).toHaveLength(2);
    expect(validationRows.map((row) => row.transport_error_paths)).toEqual([
      [],
      ["$.campaign.name", "$.brief.objective"],
    ]);
    expect(validationRows.map((row) => row.domain_error_paths)).toEqual([
      [],
      ["$.output.headline"],
    ]);

    const failureRows = await sql<{ schema_error_paths: unknown }[]>`
      SELECT schema_error_paths
      FROM live_smoke_failure_evidence_event
      WHERE failure_key IN (${emptyFailure.failureKey}, ${nonEmptyFailure.failureKey})
      ORDER BY failure_key
    `;
    expect(failureRows).toHaveLength(2);
    expect(failureRows.map((row) => row.schema_error_paths)).toEqual([[], ["$.schema.one"]]);

    const checks = await sql<
      {
        validation_empty_type: string;
        validation_non_empty_type: string;
        domain_non_empty_type: string;
        failure_empty_type: string;
        failure_non_empty_type: string;
        validation_elements_are_strings: boolean;
        failure_elements_are_strings: boolean;
        null_arrays: number;
      }[]
    >`
      SELECT
        (SELECT jsonb_typeof(transport_error_paths)
         FROM live_smoke_validation_evidence_event
         WHERE evidence_key = ${emptyValidation.evidenceKey}) AS validation_empty_type,
        (SELECT jsonb_typeof(transport_error_paths)
         FROM live_smoke_validation_evidence_event
         WHERE evidence_key = ${nonEmptyValidation.evidenceKey}) AS validation_non_empty_type,
        (SELECT jsonb_typeof(domain_error_paths)
         FROM live_smoke_validation_evidence_event
         WHERE evidence_key = ${nonEmptyValidation.evidenceKey}) AS domain_non_empty_type,
        (SELECT jsonb_typeof(schema_error_paths)
         FROM live_smoke_failure_evidence_event
         WHERE failure_key = ${emptyFailure.failureKey}) AS failure_empty_type,
        (SELECT jsonb_typeof(schema_error_paths)
         FROM live_smoke_failure_evidence_event
         WHERE failure_key = ${nonEmptyFailure.failureKey}) AS failure_non_empty_type,
        (SELECT COALESCE(bool_and(jsonb_typeof(value) = 'string'), true)
         FROM live_smoke_validation_evidence_event,
              jsonb_array_elements(transport_error_paths) AS value
         WHERE evidence_key = ${nonEmptyValidation.evidenceKey}) AS validation_elements_are_strings,
        (SELECT COALESCE(bool_and(jsonb_typeof(value) = 'string'), true)
         FROM live_smoke_failure_evidence_event,
              jsonb_array_elements(schema_error_paths) AS value
          WHERE failure_key = ${nonEmptyFailure.failureKey}) AS failure_elements_are_strings,
        (SELECT count(*)::int
         FROM live_smoke_validation_evidence_event
         WHERE evidence_key IN (${emptyValidation.evidenceKey}, ${nonEmptyValidation.evidenceKey})
           AND (transport_error_paths IS NULL OR domain_error_paths IS NULL))
        +
        (SELECT count(*)::int
         FROM live_smoke_failure_evidence_event
         WHERE failure_key IN (${emptyFailure.failureKey}, ${nonEmptyFailure.failureKey})
           AND schema_error_paths IS NULL) AS null_arrays
    `;
    expect(checks[0]).toEqual({
      validation_empty_type: "array",
      validation_non_empty_type: "array",
      domain_non_empty_type: "array",
      failure_empty_type: "array",
      failure_non_empty_type: "array",
      validation_elements_are_strings: true,
      failure_elements_are_strings: true,
      null_arrays: 0,
    });
  });

  it("reproduces the R6 SDK_ATTEMPT empty-array fixture without a Provider", async () => {
    const validation = new PostgresLiveSmokeValidationEvidenceStore(sql);
    const failure = new PostgresLiveSmokeFailureEvidenceStore(sql);
    const providerCalls = 0;
    const fixture = validationInput({
      evidenceKey: `b6-r6-sdk-attempt-${randomUUID()}`,
      transportErrorPaths: Object.freeze([]),
      domainErrorPaths: Object.freeze([]),
    });
    const failureFixture = failureInput({
      failureKey: `b6-r6-schema-${randomUUID()}`,
      schemaErrorPaths: Object.freeze([]),
    });

    expect(await validation.record(fixture)).toEqual({ inserted: true });
    expect(await failure.record(failureFixture)).toEqual({ inserted: true });
    expect(providerCalls).toBe(0);
  });
});
