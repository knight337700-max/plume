import { createHash } from "node:crypto";
import type { Sql } from "postgres";

export interface LiveSmokeVerificationRunInput {
  readonly verificationRunId: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentWorkflowJobId: string;
  readonly idempotencyKey: string;
}

export interface LiveSmokeVerificationRun {
  readonly verificationRunId: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentWorkflowJobId: string;
  readonly idempotencyKey: string;
  readonly created: boolean;
}

export interface AgentLiveCoverageInput {
  readonly verificationRunId: string;
  readonly workspaceId: string;
  readonly smokeRunId: string;
  readonly budgetEpochId: string;
  readonly parentWorkflowJobId: string;
  readonly agentCode: string;
  readonly provider: "OpenAI";
  readonly model: string;
  readonly providerRequestSent: boolean;
  readonly structuredOutputPassed: boolean;
  readonly domainValidationPassed: boolean;
  readonly providerRequestId?: string;
  readonly inputUnits?: number;
  readonly outputUnits?: number;
}

export interface LiveSmokeCoverageStore {
  createVerificationRun(input: LiveSmokeVerificationRunInput): Promise<LiveSmokeVerificationRun>;
  recordCoverage(input: AgentLiveCoverageInput): Promise<{ readonly inserted: boolean }>;
  listCoverage(
    workspaceId: string,
    verificationRunId: string,
  ): Promise<
    readonly {
      readonly agentCode: string;
      readonly provider: string;
      readonly model: string;
      readonly providerRequestSent: boolean;
      readonly structuredOutputPassed: boolean;
      readonly domainValidationPassed: boolean;
    }[]
  >;
}

interface VerificationRunRow {
  readonly verification_run_id: string;
  readonly workspace_id: string;
  readonly smoke_run_id: string;
  readonly budget_epoch_id: string;
  readonly parent_workflow_job_id: string;
  readonly idempotency_key: string;
}

export class PostgresLiveSmokeCoverageStore implements LiveSmokeCoverageStore {
  public constructor(private readonly sql: Sql) {}

  async createVerificationRun(
    input: LiveSmokeVerificationRunInput,
  ): Promise<LiveSmokeVerificationRun> {
    return this.sql.begin(async (transaction) => {
      const inserted = await transaction`
        INSERT INTO live_smoke_verification_run
          (verification_run_id, workspace_id, smoke_run_id, budget_epoch_id,
           parent_workflow_job_id, idempotency_key, purpose)
        VALUES
          (${input.verificationRunId}, ${input.workspaceId}, ${input.smokeRunId},
           ${input.budgetEpochId}, ${input.parentWorkflowJobId},
           ${input.idempotencyKey}, 'LIVE_COVERAGE_ONLY')
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
        RETURNING verification_run_id
      `;
      const rows = await transaction<VerificationRunRow[]>`
        SELECT verification_run_id, workspace_id, smoke_run_id, budget_epoch_id,
               parent_workflow_job_id, idempotency_key
        FROM live_smoke_verification_run
        WHERE workspace_id = ${input.workspaceId}
          AND idempotency_key = ${input.idempotencyKey}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("LIVE_SMOKE_VERIFICATION_RUN_NOT_FOUND");
      if (
        row.verification_run_id !== input.verificationRunId ||
        row.smoke_run_id !== input.smokeRunId ||
        row.budget_epoch_id !== input.budgetEpochId ||
        row.parent_workflow_job_id !== input.parentWorkflowJobId
      )
        throw new Error("LIVE_SMOKE_VERIFICATION_RUN_IDEMPOTENCY_CONFLICT");
      return {
        verificationRunId: row.verification_run_id,
        workspaceId: row.workspace_id,
        smokeRunId: row.smoke_run_id,
        budgetEpochId: row.budget_epoch_id,
        parentWorkflowJobId: row.parent_workflow_job_id,
        idempotencyKey: row.idempotency_key,
        created: inserted.length > 0,
      };
    });
  }

  async recordCoverage(input: AgentLiveCoverageInput): Promise<{ readonly inserted: boolean }> {
    if (input.provider !== "OpenAI") throw new Error("LIVE_COVERAGE_PROVIDER_INVALID");
    if (input.model !== "gpt-5.6-luna") throw new Error("LIVE_COVERAGE_MODEL_MISMATCH");
    if (!input.providerRequestSent) throw new Error("LIVE_COVERAGE_PROVIDER_REQUEST_REQUIRED");
    const requestIdHash = input.providerRequestId
      ? createHash("sha256").update(input.providerRequestId, "utf8").digest("hex")
      : null;
    const rows = await this.sql`
      INSERT INTO agent_live_coverage
        (workspace_id, verification_run_id, smoke_run_id, budget_epoch_id,
         parent_workflow_job_id, agent_code, provider, model,
         provider_request_sent, structured_output_passed,
         domain_validation_passed, request_id_hash, input_units, output_units)
      VALUES
        (${input.workspaceId}, ${input.verificationRunId}, ${input.smokeRunId},
         ${input.budgetEpochId}, ${input.parentWorkflowJobId}, ${input.agentCode},
         ${input.provider}, ${input.model}, ${input.providerRequestSent},
         ${input.structuredOutputPassed}, ${input.domainValidationPassed},
         ${requestIdHash}, ${input.inputUnits ?? null}, ${input.outputUnits ?? null})
      ON CONFLICT (workspace_id, verification_run_id, agent_code) DO NOTHING
      RETURNING agent_code
    `;
    return { inserted: rows.length > 0 };
  }

  async listCoverage(workspaceId: string, verificationRunId: string) {
    const rows = await this.sql<
      {
        agent_code: string;
        provider: string;
        model: string;
        provider_request_sent: boolean;
        structured_output_passed: boolean;
        domain_validation_passed: boolean;
      }[]
    >`
      SELECT agent_code, provider, model, provider_request_sent,
             structured_output_passed, domain_validation_passed
      FROM agent_live_coverage
      WHERE workspace_id = ${workspaceId} AND verification_run_id = ${verificationRunId}
      ORDER BY agent_code
    `;
    return rows.map((row) => ({
      agentCode: row.agent_code,
      provider: row.provider,
      model: row.model,
      providerRequestSent: row.provider_request_sent,
      structuredOutputPassed: row.structured_output_passed,
      domainValidationPassed: row.domain_validation_passed,
    }));
  }
}
