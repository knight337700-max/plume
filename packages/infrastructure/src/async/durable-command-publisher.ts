/* eslint-disable no-restricted-imports -- Infrastructure composes source-level ports during the monorepo build. */
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import {
  getAsyncCommandDefinition,
  validateCommandEnvelope,
  type AsyncCommandPayload,
} from "../../../contracts/src/async.js";
import type {
  AsyncCommandPublisher,
  EnqueueCommandInput,
  EnqueuedCommand,
} from "../../../core/src/async/command-publisher.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}

function jobType(command: string): string {
  if (command === "creative.generate") return "CREATIVE_GENERATION";
  if (command === "creative.render" || command === "creative.preview.render" || command === "validation.render" || command === "export.render") return "CREATIVE_RENDER";
  if (command === "validation.run" || command === "validation.ai_review") return "VALIDATION";
  if (command === "export.render_and_package") return "EXPORT_RENDER";
  if (command === "brief.analyze" || command === "brief.reanalyze") return "BRIEF_ANALYSIS";
  if (command === "product.match") return "PRODUCT_MATCH";
  if (command === "asset.recommend") return "ASSET_RECOMMENDATION";
  if (command === "natural_language.edit") return "NATURAL_LANGUAGE_EDIT";
  return "CREATIVE_GENERATION";
}

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function safeJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export class DurableAsyncCommandPublisher implements AsyncCommandPublisher {
  public constructor(private readonly sql: Sql) {}

  async enqueue<TPayload>(input: EnqueueCommandInput<TPayload>): Promise<EnqueuedCommand> {
    const definition = getAsyncCommandDefinition(input.command);
    if (input.schemaVersion !== definition.schemaVersion) throw new Error("ASYNC_SCHEMA_VERSION_UNSUPPORTED");
    const workspaceId = input.workspaceId;
    const jobId = input.jobId ?? randomUUID();
    const jobItemId = input.jobItemId ?? randomUUID();
    const messageId = randomUUID();
    const correlationId = input.correlationId ?? jobId;
    const createdAt = new Date().toISOString();
    const envelope = validateCommandEnvelope({
      messageId,
      schemaVersion: input.schemaVersion,
      workspaceId,
      correlationId,
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      jobId,
      jobItemId,
      createdAt,
      command: input.command,
      payload: input.payload,
    });
    const hash = payloadHash(input.payload);
    const requestedBy = isUuid(input.requestedBy) ? input.requestedBy : null;

    try {
      return await this.sql.begin(async (transaction) => {
        if (input.idempotencyKey) {
          const existing = await transaction<{ id: string; item_id: string; message_id: string; correlation_id: string; payload_hash: string }[]>`
            SELECT j.id, i.id AS item_id, i.message_id, j.correlation_id, j.payload_hash
            FROM async_job j
            JOIN async_job_item i ON i.async_job_id = j.id
            WHERE j.workspace_id = ${workspaceId} AND j.idempotency_key = ${input.idempotencyKey}
            ORDER BY j.created_at DESC
            LIMIT 1
          `;
          const prior = existing[0];
          if (prior) {
            if (prior.payload_hash !== hash) throw Object.assign(new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"), { code: "IDEMPOTENCY_CONFLICT", statusCode: 409 });
            return { jobId: prior.id, jobItemId: prior.item_id, messageId: prior.message_id, status: "QUEUED" as const, correlationId: prior.correlation_id };
          }
        }
        if (!input.jobId) {
          await transaction`
            INSERT INTO async_job
              (id, workspace_id, job_type, status, subject_type, requested_by, correlation_id, idempotency_key, payload_hash, payload_json)
            VALUES
              (${jobId}, ${workspaceId}, ${jobType(input.command)}, 'QUEUED', 'ASYNC_COMMAND', ${requestedBy}, ${correlationId}, ${input.idempotencyKey ?? null}, ${hash}, ${this.sql.json({ command: input.command, schemaVersion: input.schemaVersion })})
          `;
        } else {
          const roots = await transaction<{ id: string; workspace_id: string; correlation_id: string }[]>`
            SELECT id, workspace_id, correlation_id FROM async_job WHERE id = ${jobId} FOR UPDATE
          `;
          if (!roots[0] || roots[0].workspace_id !== workspaceId) throw new Error("ASYNC_ROOT_JOB_NOT_FOUND");
        }
        await transaction`
          INSERT INTO async_job_item
            (id, workspace_id, async_job_id, item_key, command, message_id, causation_id, status)
          VALUES
            (${jobItemId}, ${workspaceId}, ${jobId}, ${jobItemId}, ${input.command}, ${messageId}, ${input.causationId ?? null}, 'QUEUED')
        `;
        await transaction`
          INSERT INTO outbox_message
            (workspace_id, topic, message_key, message_type, schema_version, payload_json, headers_json)
          VALUES
            (${workspaceId}, ${definition.queue}, ${messageId}, ${input.command}, ${input.schemaVersion}, ${this.sql.json(safeJson(envelope.payload) as never)}, ${this.sql.json({
              messageId,
              correlationId,
              ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
              jobId,
              jobItemId,
              createdAt,
              ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
            })})
        `;
        return { jobId, jobItemId, messageId, status: "QUEUED" as const, correlationId };
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || !input.idempotencyKey) throw error;
      const existing = await this.sql<{ id: string; item_id: string; message_id: string; correlation_id: string }[]>`
        SELECT j.id, i.id AS item_id, i.message_id, j.correlation_id
        FROM async_job j
        JOIN async_job_item i ON i.async_job_id = j.id
        WHERE j.workspace_id = ${workspaceId} AND j.idempotency_key = ${input.idempotencyKey}
        ORDER BY j.created_at DESC LIMIT 1
      `;
      const prior = existing[0];
      if (!prior) throw error;
      return { jobId: prior.id, jobItemId: prior.item_id, messageId: prior.message_id, status: "QUEUED", correlationId: prior.correlation_id };
    }
  }
}
