import type { Sql } from "postgres";
import type { AsyncJobItemStatus } from "../../../core/src/modules/operations/async-job-item.js";
import type { AsyncJobStatus } from "../../../core/src/modules/operations/async-job.js";
import type { JobListFilter, JobQueryRepository } from "../../../core/src/modules/operations/job-use-cases.js";
import type { JobItemRecord, JobRecord } from "../../../core/src/modules/operations/job-repository.js";

function notFound(): Error {
  return Object.assign(new Error("Job not found"), { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
}

function mapJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ...(row.job_type === null || row.job_type === undefined ? {} : { jobType: String(row.job_type) }),
    ...(row.correlation_id === null || row.correlation_id === undefined ? {} : { correlationId: String(row.correlation_id) }),
    status: String(row.status) as AsyncJobStatus,
    progressPercent: Number(row.progress_percent),
    attemptNo: Number(row.attempt_no),
    maxAttempts: Number(row.max_attempts),
  };
}

export class DurableJobQueryRepository implements JobQueryRepository {
  public constructor(private readonly sql: Sql) {}

  async listJobs(workspaceId: string, filter: JobListFilter = {}): Promise<readonly JobRecord[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, workspace_id, job_type, correlation_id, status, progress_percent, attempt_no, max_attempts
      FROM async_job
      WHERE workspace_id = ${workspaceId}
        AND (${filter.status ?? null} IS NULL OR status = ${filter.status ?? null})
        AND (${filter.jobType ?? null} IS NULL OR job_type = ${filter.jobType ?? null})
      ORDER BY created_at DESC
      LIMIT ${Math.max(1, Math.min(200, Math.floor(filter.limit ?? 50)))}
    `;
    return rows.map(mapJob);
  }

  async getJob(workspaceId: string, id: string): Promise<JobRecord | null> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, workspace_id, job_type, correlation_id, status, progress_percent, attempt_no, max_attempts
      FROM async_job WHERE id = ${id} AND workspace_id = ${workspaceId}
    `;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async listItems(workspaceId: string, jobId: string): Promise<readonly JobItemRecord[]> {
    const job = await this.getJob(workspaceId, jobId);
    if (!job) throw notFound();
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, async_job_id, item_key, command, message_id, causation_id, status, progress_percent, result_json, error_json
      FROM async_job_item WHERE async_job_id = ${jobId} AND workspace_id = ${workspaceId}
      ORDER BY item_key
    `;
    return rows.map((row) => ({
      id: String(row.id),
      jobId: String(row.async_job_id),
      itemKey: String(row.item_key),
      ...(row.command === null || row.command === undefined ? {} : { command: String(row.command) }),
      ...(row.message_id === null || row.message_id === undefined ? {} : { messageId: String(row.message_id) }),
      ...(row.causation_id === null || row.causation_id === undefined ? {} : { causationId: String(row.causation_id) }),
      status: String(row.status) as AsyncJobItemStatus,
      progressPercent: Number(row.progress_percent),
      ...(row.result_json === null || row.result_json === undefined ? {} : { result: row.result_json }),
      ...(row.error_json === null || row.error_json === undefined ? {} : { error: row.error_json }),
    }));
  }

  async cancelJob(workspaceId: string, id: string): Promise<JobRecord> {
    const result = await this.sql<Record<string, unknown>[]>`
      UPDATE async_job SET status = 'CANCELLED', completed_at = now()
      WHERE id = ${id} AND workspace_id = ${workspaceId} AND status IN ('QUEUED', 'RUNNING')
      RETURNING id, workspace_id, job_type, correlation_id, status, progress_percent, attempt_no, max_attempts
    `;
    if (!result[0]) throw notFound();
    await this.sql`UPDATE async_job_item SET status = 'CANCELLED', completed_at = now() WHERE async_job_id = ${id} AND status IN ('QUEUED', 'RUNNING')`;
    return mapJob(result[0]);
  }

  async retryJob(workspaceId: string, id: string): Promise<JobRecord> {
    const result = await this.sql<Record<string, unknown>[]>`
      UPDATE async_job SET status = 'QUEUED', progress_percent = 0, attempt_no = attempt_no + 1, completed_at = NULL, error_json = NULL
      WHERE id = ${id} AND workspace_id = ${workspaceId} AND status IN ('FAILED', 'PARTIAL_SUCCESS')
      RETURNING id, workspace_id, job_type, correlation_id, status, progress_percent, attempt_no, max_attempts
    `;
    if (!result[0]) throw notFound();
    await this.sql`UPDATE async_job_item SET status = 'QUEUED', progress_percent = 0, error_json = NULL, completed_at = NULL WHERE async_job_id = ${id} AND status IN ('FAILED', 'CANCELLED')`;
    return mapJob(result[0]);
  }
}
