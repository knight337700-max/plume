import type { Sql } from "postgres";
import type {
  JobItemRecord,
  JobRecord,
  JobRepository,
} from "../../../core/src/modules/operations/job-repository.js";

export class DrizzleJobRepository implements JobRepository {
  constructor(private readonly sql: Sql) {}

  async getJob(id: string): Promise<JobRecord | null> {
    const rows = await this.sql<any[]>`
      SELECT id, workspace_id, status, progress_percent, attempt_no, max_attempts FROM async_job WHERE id = ${id}
    `;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          status: row.status,
          progressPercent: Number(row.progress_percent),
          attemptNo: row.attempt_no,
          maxAttempts: row.max_attempts,
        }
      : null;
  }

  async listItems(jobId: string): Promise<readonly JobItemRecord[]> {
    const rows = await this.sql<any[]>`
      SELECT id, async_job_id, item_key, status, progress_percent, result_json, error_json
      FROM async_job_item WHERE async_job_id = ${jobId} ORDER BY item_key
    `;
    return rows.map((row) => ({
      id: row.id,
      jobId: row.async_job_id,
      itemKey: row.item_key,
      status: row.status,
      progressPercent: Number(row.progress_percent),
      ...(row.result_json ? { result: row.result_json } : {}),
      ...(row.error_json ? { error: row.error_json } : {}),
    }));
  }

  async updateItem(item: JobItemRecord): Promise<void> {
    await this.sql`
      UPDATE async_job_item
      SET status = ${item.status}, progress_percent = ${item.progressPercent},
          result_json = ${item.result === undefined ? null : JSON.parse(JSON.stringify(item.result))},
          error_json = ${item.error === undefined ? null : JSON.parse(JSON.stringify(item.error))},
          completed_at = CASE WHEN ${item.status} IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN now() ELSE completed_at END
      WHERE id = ${item.id} AND async_job_id = ${item.jobId}
    `;
  }

  async updateProgress(jobId: string, progressPercent: number, status: string): Promise<void> {
    await this.sql`
      UPDATE async_job SET progress_percent = ${progressPercent}, status = ${status} WHERE id = ${jobId}
    `;
  }
}
