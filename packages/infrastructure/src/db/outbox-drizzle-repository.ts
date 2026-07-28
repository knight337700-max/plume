import type { Sql } from "postgres";
import type {
  NewOutboxMessage,
  OutboxMessage,
  OutboxRepository,
} from "../../../core/src/modules/operations/outbox-repository.js";

interface OutboxRow {
  id: string;
  workspace_id: string;
  topic: string;
  message_key: string;
  message_type: string;
  schema_version: number;
  payload_json: Record<string, unknown>;
  headers_json: Record<string, unknown>;
  available_at: Date;
  published_at: Date | null;
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
  lease_expires_at: Date | null;
}

function mapRow(row: OutboxRow): OutboxMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    topic: row.topic,
    messageKey: row.message_key,
    messageType: row.message_type,
    schemaVersion: row.schema_version,
    payloadJson: row.payload_json,
    headersJson: row.headers_json,
    availableAt: row.available_at,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
    attemptCount: row.attempt_count,
    ...(row.last_error ? { lastError: row.last_error } : {}),
    createdAt: row.created_at,
    ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
  };
}

export class DrizzleOutboxRepository implements OutboxRepository {
  constructor(private readonly sql: Sql) {}

  async insert(message: NewOutboxMessage): Promise<OutboxMessage> {
    const rows = await this.sql<OutboxRow[]>`
      INSERT INTO outbox_message
        (workspace_id, topic, message_key, message_type, schema_version, payload_json, headers_json, available_at)
      VALUES
        (${message.workspaceId}, ${message.topic}, ${message.messageKey}, ${message.messageType}, ${message.schemaVersion},
         ${this.sql.json(message.payloadJson)}, ${this.sql.json(message.headersJson ?? {})}, ${message.availableAt ?? new Date()})
      RETURNING *
    `;
    return mapRow(rows[0]);
  }

  async claim(limit: number, leaseMs: number): Promise<readonly OutboxMessage[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const expires = new Date(Date.now() + Math.max(1000, leaseMs));
    const rows = await this.sql<OutboxRow[]>`
      UPDATE outbox_message
      SET lease_expires_at = ${expires}, attempt_count = attempt_count + 1
      WHERE id IN (
        SELECT id FROM outbox_message
        WHERE published_at IS NULL
          AND available_at <= now()
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      RETURNING *
    `;
    return rows.map(mapRow);
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<void> {
    await this
      .sql`UPDATE outbox_message SET published_at = ${publishedAt}, lease_expires_at = NULL, last_error = NULL WHERE id = ${id}`;
  }

  async markFailed(id: string, error: string, availableAt: Date): Promise<void> {
    await this
      .sql`UPDATE outbox_message SET last_error = ${error.slice(0, 2000)}, available_at = ${availableAt}, lease_expires_at = NULL WHERE id = ${id}`;
  }
}
