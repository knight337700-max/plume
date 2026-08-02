import type { Sql } from "postgres";
import { Buffer } from "node:buffer";

function jsonbBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

export interface WorkflowItem {
  readonly id: string;
  readonly jobId: string;
  readonly itemKey: string;
  readonly command: string | null;
  readonly messageId: string | null;
  readonly status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly result?: unknown;
  readonly error?: unknown;
}

function mapItem(row: Record<string, unknown>): WorkflowItem {
  return {
    id: String(row.id),
    jobId: String(row.async_job_id),
    itemKey: String(row.item_key),
    command: row.command === null || row.command === undefined ? null : String(row.command),
    messageId: row.message_id === null || row.message_id === undefined ? null : String(row.message_id),
    status: String(row.status) as WorkflowItem["status"],
    ...(row.result_json === null || row.result_json === undefined ? {} : { result: row.result_json }),
    ...(row.error_json === null || row.error_json === undefined ? {} : { error: row.error_json }),
  };
}

export class DurableWorkflowRepository {
  public constructor(private readonly sql: Sql) {}

  async claimItem(workspaceId: string, jobId: string, jobItemId: string): Promise<WorkflowItem> {
    const rows = await this.sql<Record<string, unknown>[]>`
      UPDATE async_job_item
      SET status = 'RUNNING', started_at = COALESCE(started_at, now())
      WHERE id = ${jobItemId} AND async_job_id = ${jobId} AND workspace_id = ${workspaceId} AND status = 'QUEUED'
      RETURNING id, async_job_id, item_key, command, message_id, status, result_json, error_json
    `;
    if (!rows[0]) {
      const existing = await this.sql<Record<string, unknown>[]>`
        SELECT id, async_job_id, item_key, command, message_id, status, result_json, error_json
        FROM async_job_item WHERE id = ${jobItemId} AND async_job_id = ${jobId} AND workspace_id = ${workspaceId}
      `;
      if (!existing[0]) throw Object.assign(new Error("ASYNC_JOB_ITEM_NOT_FOUND"), { code: "RESOURCE_NOT_FOUND" });
      return mapItem(existing[0]);
    }
    await this.sql`UPDATE async_job SET status = 'RUNNING', started_at = COALESCE(started_at, now()) WHERE id = ${jobId} AND workspace_id = ${workspaceId} AND status = 'QUEUED'`;
    return mapItem(rows[0]);
  }

  async completeItem(workspaceId: string, jobId: string, jobItemId: string, result: unknown): Promise<void> {
    await this.sql`
      UPDATE async_job_item SET status = 'COMPLETED', progress_percent = 100, result_json = convert_from(${jsonbBytes(JSON.parse(JSON.stringify(result)))}, 'UTF8')::jsonb, completed_at = now()
      WHERE id = ${jobItemId} AND async_job_id = ${jobId} AND workspace_id = ${workspaceId}
    `;
  }

  async failItem(workspaceId: string, jobId: string, jobItemId: string, error: unknown): Promise<void> {
    await this.sql`
      UPDATE async_job_item SET status = 'FAILED', error_json = convert_from(${jsonbBytes(JSON.parse(JSON.stringify(error)))}, 'UTF8')::jsonb, completed_at = now()
      WHERE id = ${jobItemId} AND async_job_id = ${jobId} AND workspace_id = ${workspaceId}
    `;
    await this.sql`UPDATE async_job SET status = 'FAILED', error_json = convert_from(${jsonbBytes(JSON.parse(JSON.stringify(error)))}, 'UTF8')::jsonb, completed_at = now() WHERE id = ${jobId} AND workspace_id = ${workspaceId}`;
  }

  async releaseItem(workspaceId: string, jobId: string, jobItemId: string): Promise<void> {
    await this.sql`
      UPDATE async_job_item SET status = 'QUEUED', started_at = NULL
      WHERE id = ${jobItemId} AND async_job_id = ${jobId} AND workspace_id = ${workspaceId} AND status = 'RUNNING'
    `;
  }

  async listItems(workspaceId: string, jobId: string): Promise<readonly WorkflowItem[]> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT id, async_job_id, item_key, command, message_id, status, result_json, error_json
      FROM async_job_item WHERE async_job_id = ${jobId} AND workspace_id = ${workspaceId} ORDER BY item_key
    `;
    return rows.map(mapItem);
  }

  async completeRootIfReady(workspaceId: string, jobId: string): Promise<boolean> {
    const rows = await this.sql<{ total: number; completed: number; failed: number; queued: number }[]>`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE status IN ('QUEUED', 'RUNNING'))::int AS queued
      FROM async_job_item WHERE async_job_id = ${jobId} AND workspace_id = ${workspaceId}
    `;
    const state = rows[0];
    if (!state || state.queued > 0 || state.total === 0) return false;
    const status = state.failed > 0 ? (state.completed > 0 ? "PARTIAL_SUCCESS" : "FAILED") : "COMPLETED";
    await this.sql`UPDATE async_job SET status = ${status}, progress_percent = 100, completed_at = now() WHERE id = ${jobId} AND workspace_id = ${workspaceId} AND status <> 'CANCELLED'`;
    return true;
  }

  async setRootPayload(workspaceId: string, jobId: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
    await this.sql`UPDATE async_job SET payload_json = convert_from(${jsonbBytes(JSON.parse(JSON.stringify(payload)))}, 'UTF8')::jsonb WHERE id = ${jobId} AND workspace_id = ${workspaceId}`;
  }
}
