import type { BullMqAdapter } from "../../../../../packages/infrastructure/src/queue/bullmq.js";
import type {
  OutboxMessage,
  OutboxRepository,
} from "../../../../../packages/core/src/modules/operations/outbox-repository.js";

export interface OutboxPublishResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

function retryAt(attemptCount: number): Date {
  const delays = [5_000, 30_000, 120_000, 600_000];
  return new Date(
    Date.now() + (delays[Math.min(attemptCount, delays.length - 1)] ?? delays.at(-1)!),
  );
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
      await queue.enqueue(message.topic, {
        name: message.messageType,
        data: message,
        options: { jobId: message.id, attempts: 1 },
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
