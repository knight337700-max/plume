import type { Sql } from "postgres";

export type LiveSmokeValidationEvidenceStage =
  | "SDK_ATTEMPT"
  | "PROVIDER_RESPONSE"
  | "VALIDATION"
  | "COVERAGE_WRITE";
export type LiveSmokeEvidenceStatus = "PASS" | "FAIL" | "NOT_REACHED";

export interface LiveSmokeValidationEvidenceInput {
  readonly evidenceKey: string;
  readonly evidenceStage: LiveSmokeValidationEvidenceStage;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly verificationRunId?: string;
  readonly jobItemId: string;
  readonly agentCode: string;
  readonly callKind: "initial" | "retry" | "repair";
  readonly sdkRequestAttempted: boolean;
  readonly providerResponseReceived: boolean;
  readonly providerHttpStatus?: number;
  readonly providerRequestIdHash?: string;
  readonly resolvedModel?: string;
  readonly jsonParseStatus: LiveSmokeEvidenceStatus;
  readonly transportValidationStatus: LiveSmokeEvidenceStatus;
  readonly transportErrorCode?: string;
  readonly transportErrorPaths?: readonly string[];
  readonly domainValidationStatus: LiveSmokeEvidenceStatus;
  readonly domainErrorCode?: string;
  readonly domainErrorPaths?: readonly string[];
  readonly repairEligible: boolean;
  readonly retryEligible: boolean;
  readonly coverageWriteAttempted: boolean;
  readonly coverageWriteSucceeded: boolean;
  readonly coverageWriteErrorCode?: string;
  readonly inputUnits?: number;
  readonly outputUnits?: number;
  readonly outputFingerprint?: string;
  readonly outputLengthBytes?: number;
}

export interface LiveSmokeValidationEvidenceStore {
  record(input: LiveSmokeValidationEvidenceInput): Promise<{ readonly inserted: boolean }>;
}

function redactedPaths(paths: readonly string[] | undefined): readonly string[] {
  return Object.freeze(
    [...new Set((paths ?? []).filter((path) => path.length > 0))].slice(0, 20),
  );
}

export class PostgresLiveSmokeValidationEvidenceStore
  implements LiveSmokeValidationEvidenceStore
{
  public constructor(private readonly sql: Sql) {}

  async record(input: LiveSmokeValidationEvidenceInput) {
    const rows = await this.sql`
      INSERT INTO live_smoke_validation_evidence_event
        (evidence_key, evidence_stage, workspace_id, smoke_run_id, budget_epoch_id,
         verification_run_id, job_item_id, agent_code, call_kind,
         sdk_request_attempted, provider_response_received, provider_http_status,
         provider_request_id_hash, resolved_model, json_parse_status,
         transport_validation_status, transport_error_code, transport_error_paths,
         domain_validation_status, domain_error_code, domain_error_paths,
         repair_eligible, retry_eligible, coverage_write_attempted,
         coverage_write_succeeded, coverage_write_error_code, input_units, output_units,
         output_fingerprint, output_length_bytes)
      VALUES
        (${input.evidenceKey}, ${input.evidenceStage}, ${input.workspaceId},
         ${input.smokeRunId}, ${input.budgetEpochId}, ${input.verificationRunId ?? null},
         ${input.jobItemId}, ${input.agentCode}, ${input.callKind},
         ${input.sdkRequestAttempted}, ${input.providerResponseReceived},
         ${input.providerHttpStatus ?? null}, ${input.providerRequestIdHash ?? null},
         ${input.resolvedModel ?? null}, ${input.jsonParseStatus},
         ${input.transportValidationStatus}, ${input.transportErrorCode ?? null},
         ${this.sql.json(redactedPaths(input.transportErrorPaths))},
         ${input.domainValidationStatus}, ${input.domainErrorCode ?? null},
         ${this.sql.json(redactedPaths(input.domainErrorPaths))},
         ${input.repairEligible}, ${input.retryEligible}, ${input.coverageWriteAttempted},
         ${input.coverageWriteSucceeded}, ${input.coverageWriteErrorCode ?? null},
         ${input.inputUnits ?? null}, ${input.outputUnits ?? null},
         ${input.outputFingerprint ?? null}, ${input.outputLengthBytes ?? null})
      ON CONFLICT (evidence_key) DO NOTHING
      RETURNING event_id
    `;
    return { inserted: rows.length > 0 };
  }
}
