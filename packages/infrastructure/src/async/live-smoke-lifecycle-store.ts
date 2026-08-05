import { createHash } from "node:crypto";
import type { Sql } from "postgres";

export type LiveSmokeReservationLifecycleState =
  | "RESERVED"
  | "DISPATCH_STARTED"
  | "PROVIDER_RESPONDED"
  | "RELEASED_PRE_DISPATCH";

export interface LiveSmokeReservationLifecycleInput {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly reservationKey: string;
  readonly agentCode?: string;
  readonly lifecycleState: LiveSmokeReservationLifecycleState;
  readonly providerMode: "mock" | "live";
  readonly providerRequestSent: boolean;
  readonly providerResponseReceived: boolean;
  readonly billableRequestCount: 0 | 1;
  readonly providerRequestIdHash?: string;
  /** @deprecated callers should provide providerRequestIdHash. */
  readonly providerRequestId?: string;
  readonly inputUnits?: number;
  readonly outputUnits?: number;
  readonly terminalErrorCode?: string;
}

export interface LiveSmokeBudgetReconciliationInput {
  readonly reconciliationKey: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly reservedUnits: number;
  readonly providerRequestsSent: number;
  readonly providerResponsesReceived: number;
  readonly preDispatchReleased: number;
  readonly liveCoverageCreated: number;
  readonly originalRowsMutated: false;
  readonly rootCauseClassification: string;
  readonly detailsRedacted: string;
}

export interface LiveSmokeProviderCanaryResult {
  readonly verificationRunId: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly status: "PENDING" | "PASS" | "FAIL";
}

export interface LiveSmokeCanaryScope {
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
}

export interface LiveSmokeEnsureCanaryResult {
  readonly created: boolean;
  readonly scopeMatches: boolean;
  readonly status: "PENDING" | "PASS" | "FAIL";
}

export interface LiveSmokeRecordCanaryResult {
  readonly updated: boolean;
  readonly status: "PASS" | "FAIL";
}

export interface LiveSmokeLifecycleStore {
  record(input: LiveSmokeReservationLifecycleInput): Promise<{ readonly inserted: boolean }>;
  markProviderRequestAttempt(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }): Promise<{ readonly updated: boolean }>;
  recordReconciliation(
    input: LiveSmokeBudgetReconciliationInput,
  ): Promise<{ readonly inserted: boolean }>;
  ensureCanary(input: {
    readonly verificationRunId: string;
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
  }): Promise<LiveSmokeEnsureCanaryResult>;
  getCanaryStatus(
    verificationRunId: string,
    scope?: LiveSmokeCanaryScope,
  ): Promise<"PENDING" | "PASS" | "FAIL">;
  recordCanary(input: {
    readonly verificationRunId: string;
    readonly providerRequestSent: boolean;
    readonly providerResponseReceived: boolean;
    readonly http200: boolean;
    readonly resolvedModel?: string;
    readonly strictOutputValid: boolean;
    readonly domainValidationValid: boolean;
    readonly storeDisabled: boolean;
    readonly backgroundDisabled: boolean;
    readonly toolsUnused: boolean;
    readonly passed: boolean;
    readonly errorCode?: string;
  }): Promise<LiveSmokeRecordCanaryResult>;
}

export class PostgresLiveSmokeLifecycleStore implements LiveSmokeLifecycleStore {
  public constructor(private readonly sql: Sql) {}

  async record(input: LiveSmokeReservationLifecycleInput) {
    const requestIdHash =
      input.providerRequestIdHash ??
      (input.providerRequestId
        ? createHash("sha256").update(input.providerRequestId, "utf8").digest("hex")
        : null);
    const rows = await this.sql`
      INSERT INTO live_smoke_reservation_lifecycle_event
        (workspace_id, smoke_run_id, budget_epoch_id, reservation_key, agent_code,
         lifecycle_state, provider_mode, provider_request_sent,
         provider_response_received, billable_request_count, request_id_hash,
         input_units, output_units, terminal_error_code)
      VALUES
        (${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId},
         ${input.reservationKey}, ${input.agentCode ?? null}, ${input.lifecycleState},
         ${input.providerMode}, ${input.providerRequestSent},
         ${input.providerResponseReceived}, ${input.billableRequestCount},
         ${requestIdHash}, ${input.inputUnits ?? null}, ${input.outputUnits ?? null},
         ${input.terminalErrorCode ?? null})
      ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id, reservation_key, lifecycle_state)
      DO NOTHING
      RETURNING event_id
    `;
    return { inserted: rows.length > 0 };
  }

  async markProviderRequestAttempt(input: {
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
    readonly reservationKey: string;
  }) {
    const rows = await this.sql`
      UPDATE live_smoke_reservation_lifecycle_event
      SET provider_request_sent = true,
          billable_request_count = 1
      WHERE workspace_id = ${input.workspaceId}
        AND smoke_run_id = ${input.smokeRunId}
        AND budget_epoch_id = ${input.budgetEpochId}
        AND reservation_key = ${input.reservationKey}
        AND lifecycle_state = 'DISPATCH_STARTED'
        AND provider_request_sent = false
    `;
    return { updated: rows.count === 1 };
  }

  async recordReconciliation(input: LiveSmokeBudgetReconciliationInput) {
    const rows = await this.sql`
      INSERT INTO live_smoke_budget_reconciliation_event
        (reconciliation_key, workspace_id, smoke_run_id, budget_epoch_id,
         reserved_units, provider_requests_sent, provider_responses_received,
         pre_dispatch_released, live_coverage_created, original_rows_mutated,
         root_cause_classification, details_redacted)
      VALUES
        (${input.reconciliationKey}, ${input.workspaceId}, ${input.smokeRunId},
         ${input.budgetEpochId}, ${input.reservedUnits}, ${input.providerRequestsSent},
         ${input.providerResponsesReceived}, ${input.preDispatchReleased},
         ${input.liveCoverageCreated}, ${input.originalRowsMutated},
         ${input.rootCauseClassification}, ${input.detailsRedacted})
      ON CONFLICT (reconciliation_key) DO NOTHING
      RETURNING reconciliation_event_id
    `;
    return { inserted: rows.length > 0 };
  }

  async ensureCanary(input: {
    readonly verificationRunId: string;
    readonly workspaceId: string;
    readonly smokeRunId: string;
    readonly budgetEpochId: string;
  }): Promise<LiveSmokeEnsureCanaryResult> {
    const inserted = await this.sql<
      {
        verification_run_id: string;
        workspace_id: string;
        smoke_run_id: string;
        budget_epoch_id: string;
        status: "PENDING" | "PASS" | "FAIL";
      }[]
    >`
      INSERT INTO live_smoke_provider_canary
        (verification_run_id, workspace_id, smoke_run_id, budget_epoch_id)
      VALUES
        (${input.verificationRunId}, ${input.workspaceId}, ${input.smokeRunId}, ${input.budgetEpochId})
        ON CONFLICT (verification_run_id) DO NOTHING
      RETURNING verification_run_id, workspace_id, smoke_run_id, budget_epoch_id, status
    `;
    const rows =
      inserted.length > 0
        ? inserted
        : await this.sql<
            {
              verification_run_id: string;
              workspace_id: string;
              smoke_run_id: string;
              budget_epoch_id: string;
              status: "PENDING" | "PASS" | "FAIL";
            }[]
          >`
            SELECT verification_run_id, workspace_id, smoke_run_id, budget_epoch_id, status
            FROM live_smoke_provider_canary
            WHERE verification_run_id = ${input.verificationRunId}
          `;
    const row = rows[0];
    if (!row) throw new Error("LIVE_SMOKE_CANARY_NOT_FOUND");
    const scopeMatches =
      row.workspace_id === input.workspaceId &&
      row.smoke_run_id === input.smokeRunId &&
      row.budget_epoch_id === input.budgetEpochId;
    if (!scopeMatches) throw new Error("LIVE_SMOKE_CANARY_SCOPE_CONFLICT");
    return { created: inserted.length === 1, scopeMatches: true, status: row.status };
  }

  async getCanaryStatus(verificationRunId: string, scope?: LiveSmokeCanaryScope) {
    if (scope) {
      const scopedRows = await this.sql<{ status: "PENDING" | "PASS" | "FAIL" }[]>`
          SELECT status FROM live_smoke_provider_canary
          WHERE verification_run_id = ${verificationRunId}
            AND workspace_id = ${scope.workspaceId}
            AND smoke_run_id = ${scope.smokeRunId}
            AND budget_epoch_id = ${scope.budgetEpochId}
        `;
      if (scopedRows[0]) return scopedRows[0].status;
      const identityRows = await this.sql<{ verification_run_id: string }[]>`
        SELECT verification_run_id
        FROM live_smoke_provider_canary
        WHERE verification_run_id = ${verificationRunId}
      `;
      if (identityRows[0]) throw new Error("LIVE_SMOKE_CANARY_SCOPE_CONFLICT");
      return "PENDING" as const;
    }
    const rows = await this.sql<{ status: "PENDING" | "PASS" | "FAIL" }[]>`
          SELECT status FROM live_smoke_provider_canary
          WHERE verification_run_id = ${verificationRunId}
        `;
    return rows[0]?.status ?? "PENDING";
  }

  async recordCanary(input: {
    readonly verificationRunId: string;
    readonly providerRequestSent: boolean;
    readonly providerResponseReceived: boolean;
    readonly http200: boolean;
    readonly resolvedModel?: string;
    readonly strictOutputValid: boolean;
    readonly domainValidationValid: boolean;
    readonly storeDisabled: boolean;
    readonly backgroundDisabled: boolean;
    readonly toolsUnused: boolean;
    readonly passed: boolean;
    readonly errorCode?: string;
  }): Promise<LiveSmokeRecordCanaryResult> {
    const rows = await this.sql<{ status: "PASS" | "FAIL" }[]>`
      UPDATE live_smoke_provider_canary
      SET status = ${input.passed ? "PASS" : "FAIL"},
          provider_request_sent = ${input.providerRequestSent},
          provider_response_received = ${input.providerResponseReceived},
          http_200 = ${input.http200},
          resolved_model = ${input.resolvedModel ?? null},
          strict_output_valid = ${input.strictOutputValid},
          domain_validation_valid = ${input.domainValidationValid},
          store_disabled = ${input.storeDisabled},
          background_disabled = ${input.backgroundDisabled},
          tools_unused = ${input.toolsUnused},
          error_code = ${input.errorCode ?? null},
          updated_at = now()
      WHERE verification_run_id = ${input.verificationRunId}
      RETURNING status
    `;
    return {
      updated: rows.length === 1,
      status: rows[0]?.status ?? (input.passed ? "PASS" : "FAIL"),
    };
  }
}
