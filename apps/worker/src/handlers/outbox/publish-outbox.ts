import type { BullMqAdapter } from "../../../../../packages/infrastructure/src/queue/bullmq.js";
import type {
  OutboxMessage,
  OutboxRepository,
} from "../../../../../packages/core/src/modules/operations/outbox-repository.js";
import {
  getAsyncCommandDefinition,
  validateCommandEnvelope,
} from "../../../../../packages/contracts/src/async.js";

export interface OutboxPublishResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

export function outboxToCommandEnvelope(message: OutboxMessage) {
  const definition = getAsyncCommandDefinition(message.messageType);
  if (definition.queue !== message.topic) throw new Error("OUTBOX_QUEUE_ROUTE_MISMATCH");
  const headers = message.headersJson;
  return validateCommandEnvelope({
    messageId: String(headers.messageId ?? message.messageKey),
    schemaVersion: message.schemaVersion,
    workspaceId: message.workspaceId,
    correlationId: String(headers.correlationId ?? message.messageKey),
    ...(headers.causationId === undefined ? {} : { causationId: String(headers.causationId) }),
    jobId: String(headers.jobId ?? message.messageKey),
    ...(headers.jobItemId === undefined ? {} : { jobItemId: String(headers.jobItemId) }),
    createdAt: String(headers.createdAt ?? message.createdAt.toISOString()),
    command: message.messageType,
    payload: message.payloadJson,
  });
}

function retryAt(attemptCount: number): Date {
  const delays = [5_000, 30_000, 120_000, 600_000];
  return new Date(
    Date.now() + (delays[Math.min(attemptCount, delays.length - 1)] ?? delays.at(-1)!),
  );
}

function deliveryAttempts(message: OutboxMessage): 1 | 3 {
  if (
    (message.messageType === "ai.live_smoke" || message.messageType === "ai.live_smoke.verify") &&
    message.payloadJson &&
    typeof message.payloadJson === "object" &&
    !Array.isArray(message.payloadJson) &&
    (message.payloadJson as { readonly retryEnabled?: unknown }).retryEnabled === false &&
    (message.payloadJson as { readonly repairEnabled?: unknown }).repairEnabled === false
  )
    return 1;
  return 3;
}

export async function publishOutbox(
  repository: OutboxRepository,
  queue: BullMqAdapter,
  options: { readonly limit?: number; readonly leaseMs?: number } = {},
): Promise<OutboxPublishResult> {
  const messages = await repository.claim(options.limit ?? 50, options.leaseMs ?? 30_000);
  let published = 0;
  let failed = 0;
  for (const message of messages) {
    try {
      const envelope = outboxToCommandEnvelope(message);
      await queue.enqueue(message.topic, {
        name: message.messageType,
        data: envelope,
        options: {
          jobId: message.messageKey,
          attempts: deliveryAttempts(message),
          backoff: { type: "exponential", delay: 5_000 },
        },
      });
      await repository.markPublished(message.id);
      published += 1;
    } catch (error) {
      await repository.markFailed(
        message.id,
        error instanceof Error ? error.message : String(error),
        retryAt(message.attemptCount),
      );
      failed += 1;
    }
  }
  return { claimed: messages.length, published, failed };
}

export type OutboxPublishMessage = OutboxMessage;
