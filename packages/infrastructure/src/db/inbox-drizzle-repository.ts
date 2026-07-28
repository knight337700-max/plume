import type { Sql } from "postgres";
import type { InboxRepository } from "../../../core/src/modules/operations/inbox-repository.js";

export class DrizzleInboxRepository implements InboxRepository {
  constructor(private readonly sql: Sql) {}

  async tryStart(input: {
    workspaceId: string;
    messageId: string;
    handlerName: string;
    handlerVersion: string;
  }): Promise<{ readonly acquired: boolean; readonly priorOutcome?: unknown }> {
    const inserted = await this.sql<{ id: string }[]>`
      INSERT INTO message_consumption (workspace_id, message_id, handler_name, handler_version)
      VALUES (${input.workspaceId}, ${input.messageId}, ${input.handlerName}, ${input.handlerVersion})
      ON CONFLICT (workspace_id, message_id, handler_name, handler_version) DO NOTHING
      RETURNING id
    `;
    if (inserted.length > 0) return { acquired: true };

    const existing = await this.sql<{ outcome_json: unknown }[]>`
      SELECT outcome_json FROM message_consumption
      WHERE workspace_id = ${input.workspaceId} AND message_id = ${input.messageId}
        AND handler_name = ${input.handlerName} AND handler_version = ${input.handlerVersion}
    `;
    return { acquired: false, priorOutcome: existing[0]?.outcome_json ?? null };
  }

  async complete(input: {
    workspaceId: string;
    messageId: string;
    handlerName: string;
    handlerVersion: string;
    outcome: unknown;
  }): Promise<void> {
    await this.sql`
      UPDATE message_consumption SET outcome_json = ${JSON.parse(JSON.stringify(input.outcome))}, processed_at = now()
      WHERE workspace_id = ${input.workspaceId} AND message_id = ${input.messageId}
        AND handler_name = ${input.handlerName} AND handler_version = ${input.handlerVersion}
    `;
  }
}
