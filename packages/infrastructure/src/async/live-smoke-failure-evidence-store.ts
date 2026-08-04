import type { Sql } from "postgres";
// eslint-disable-next-line no-restricted-imports -- Infrastructure composes the workspace contract source during the monorepo build.
import type { LiveSmokeFailureClass } from "../../../contracts/src/async.js";

export type LiveSmokeFailureCallKind = "canary" | "initial" | "retry" | "repair";
export type LiveSmokeFailureStage =
  | "PRE_DISPATCH"
  | "RESERVATION"
  | "DISPATCH"
  | "SDK"
  | "PROVIDER_RESPONSE"
  | "VALIDATION"
  | "SETTLEMENT"
  | "EVIDENCE";

export interface LiveSmokeFailureEvidenceInput {
  readonly failureKey: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly verificationRunId?: string;
  readonly jobItemId: string;
  readonly agentCode: string;
  readonly callKind: LiveSmokeFailureCallKind;
  readonly failureClass: LiveSmokeFailureClass;
  readonly stableErrorCode: string;
  readonly retryable: boolean;
  readonly stage: LiveSmokeFailureStage;
  readonly syntheticScenarioId: string;
  readonly reservationCreated: boolean;
  readonly dispatchStarted: boolean;
  readonly sdkAttempted: boolean;
  readonly providerResponseReceived: boolean;
  readonly usagePresent: boolean;
  readonly settlementState?: string;
  readonly validationStage?: string | undefined;
  readonly schemaErrorPaths?: readonly string[] | undefined;
}

export interface LiveSmokeFailureEvidenceStore {
  record(input: LiveSmokeFailureEvidenceInput): Promise<{ readonly inserted: boolean }>;
}

function safePaths(paths: readonly string[] | undefined): readonly string[] {
  return Object.freeze(
    [
      ...new Set((paths ?? []).filter((path) => /^\$?(?:\.[A-Za-z0-9_\[\]-]+)+$/u.test(path))),
    ].slice(0, 20),
  );
}

export function stableErrorCode(error: unknown): string {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? String((error as { readonly code?: unknown }).code ?? "")
      : error instanceof Error
        ? error.message
        : "";
  const parts = candidate
    .split(":")
    .map((part) => part.replace(/[^A-Z0-9_-]/gu, "_"))
    .filter(Boolean);
  const suffix = [...parts]
    .reverse()
    .find((part) =>
      /^(?:SCHEMA|DOMAIN|PARSE|USAGE|SETTLEMENT|EVIDENCE|UNKNOWN_BILLABLE|PROVIDER|BUDGET|DISPATCH|SDK|SCOPE|SYNTHETIC|AUTH|RATE|TIMEOUT|NETWORK|MODEL|JSON|HTTP|RETRY|REPAIR|IDEMPOTENCY|COVERAGE|INPUT|PRICING|AGENT|QUEUE|LIFECYCLE|RESERVATION|VALIDATION|EXPORT|MIGRATION|SECRET|CONFIG|INTERNAL)(?:_[A-Z0-9]+)*$/u.test(
        part,
      ),
    );
  const prefixed = [...parts]
    .reverse()
    .find((part) => /^(?:LIVE_SMOKE|AI_LIVE_SMOKE|PROVIDER|OPENAI)_[A-Z0-9_]+$/u.test(part));
  return (suffix ?? prefixed ?? "LIVE_SMOKE_FAILURE").slice(0, 120);
}

export function classifyLiveSmokeFailure(input: {
  readonly error?: unknown;
  readonly reservationCreated: boolean;
  readonly dispatchStarted: boolean;
  readonly sdkAttempted: boolean;
  readonly providerResponseReceived: boolean;
  readonly usagePresent: boolean;
  readonly validationStage?: string | undefined;
  readonly schemaErrorPaths?: readonly string[] | undefined;
}): {
  readonly failureClass: LiveSmokeFailureClass;
  readonly stage: LiveSmokeFailureStage;
  readonly stableErrorCode: string;
  readonly retryable: boolean;
} {
  const code = stableErrorCode(input.error);
  const retryable =
    input.error && typeof input.error === "object" && "retryable" in input.error
      ? (input.error as { readonly retryable?: unknown }).retryable === true
      : false;
  if (code.includes("UNKNOWN_BILLABLE"))
    return {
      failureClass: "UNKNOWN_BILLABLE",
      stage: "PROVIDER_RESPONSE",
      stableErrorCode: code,
      retryable: false,
    };
  if (
    code.includes("SYNTHETIC") ||
    code.includes("SCOPE") ||
    code.includes("AGENT_NOT_REGISTERED") ||
    code.includes("BUDGET_EPOCH_REQUIRED") ||
    code.includes("INPUT_ESTIMATE") ||
    code.includes("PRICING_POLICY_REQUIRED")
  )
    return {
      failureClass: "PRE_DISPATCH_VALIDATION",
      stage: "PRE_DISPATCH",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("REQUEST_BUDGET") || code.includes("DUPLICATE_PROVIDER_CALL"))
    return {
      failureClass: "BUDGET_RESERVATION",
      stage: "RESERVATION",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("SDK_ATTEMPT") || code.includes("LIFECYCLE") || code.includes("DISPATCH"))
    return {
      failureClass: "DISPATCH_EVIDENCE",
      stage: "DISPATCH",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("SETTLEMENT"))
    return {
      failureClass: "SETTLEMENT",
      stage: "SETTLEMENT",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("EVIDENCE") || code.includes("COVERAGE"))
    return {
      failureClass: "EVIDENCE_WRITE",
      stage: "EVIDENCE",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("SCHEMA") || code.includes("STRICT"))
    return {
      failureClass: "STRUCTURED_OUTPUT_SCHEMA",
      stage: "VALIDATION",
      stableErrorCode: code,
      retryable,
    };
  if (code.includes("DOMAIN") || input.validationStage === "DOMAIN")
    return {
      failureClass: "DOMAIN_VALIDATION",
      stage: "VALIDATION",
      stableErrorCode: code,
      retryable,
    };
  if (code.includes("PARSE") || code.includes("JSON"))
    return {
      failureClass: "PROVIDER_RESPONSE_PARSE",
      stage: "PROVIDER_RESPONSE",
      stableErrorCode: code,
      retryable,
    };
  if (code.includes("USAGE"))
    return {
      failureClass: input.usagePresent ? "USAGE_INVALID" : "USAGE_MISSING",
      stage: "PROVIDER_RESPONSE",
      stableErrorCode: code,
      retryable: false,
    };
  if (code.includes("PROVIDER") || code.includes("TIMEOUT") || code.includes("NETWORK"))
    return {
      failureClass: retryable ? "PROVIDER_TRANSPORT" : "PROVIDER_REJECTED",
      stage: input.sdkAttempted ? "PROVIDER_RESPONSE" : "SDK",
      stableErrorCode: code,
      retryable,
    };
  if (!input.reservationCreated)
    return {
      failureClass: "PRE_DISPATCH_VALIDATION",
      stage: "PRE_DISPATCH",
      stableErrorCode: code,
      retryable: false,
    };
  if (!input.dispatchStarted)
    return {
      failureClass: "BUDGET_RESERVATION",
      stage: "RESERVATION",
      stableErrorCode: code,
      retryable: false,
    };
  if (!input.sdkAttempted)
    return {
      failureClass: "DISPATCH_EVIDENCE",
      stage: "DISPATCH",
      stableErrorCode: code,
      retryable: false,
    };
  if (!input.providerResponseReceived)
    return {
      failureClass: "PROVIDER_TRANSPORT",
      stage: "PROVIDER_RESPONSE",
      stableErrorCode: code,
      retryable,
    };
  return {
    failureClass: "INTERNAL_UNKNOWN",
    stage: "EVIDENCE",
    stableErrorCode: code,
    retryable: false,
  };
}

export class PostgresLiveSmokeFailureEvidenceStore implements LiveSmokeFailureEvidenceStore {
  public constructor(private readonly sql: Sql) {}

  async record(input: LiveSmokeFailureEvidenceInput) {
    const stableCode = stableErrorCode({ code: input.stableErrorCode });
    const rows = await this.sql`
      INSERT INTO live_smoke_failure_evidence_event
        (failure_key, workspace_id, smoke_run_id, budget_epoch_id, verification_run_id,
         job_item_id, agent_code, call_kind, failure_class, stable_error_code, retryable,
         stage, synthetic_scenario_id, reservation_created, dispatch_started, sdk_attempted,
         provider_response_received, usage_present, settlement_state, validation_stage,
         schema_error_paths)
      VALUES
        (${input.failureKey}, ${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
         ${input.verificationRunId ?? null}, ${input.jobItemId}, ${input.agentCode},
         ${input.callKind}, ${input.failureClass}, ${stableCode}, ${input.retryable},
         ${input.stage}, ${input.syntheticScenarioId}, ${input.reservationCreated},
         ${input.dispatchStarted}, ${input.sdkAttempted}, ${input.providerResponseReceived},
         ${input.usagePresent}, ${input.settlementState ?? null}, ${input.validationStage ?? null},
         ${this.sql.json(JSON.stringify(safePaths(input.schemaErrorPaths)))})
      ON CONFLICT (failure_key) DO NOTHING
      RETURNING failure_event_id
    `;
    return { inserted: rows.length > 0 };
  }
}
