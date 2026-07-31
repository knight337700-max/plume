import type { InboxRepository } from "../../../../packages/core/src/modules/operations/inbox-repository.js";
import type { MessageEnvelope } from "../../../../packages/core/src/async/message-envelope.js";

export interface IdempotencyGuardOptions {
  readonly handlerName: string;
  readonly handlerVersion: string;
  readonly queuePrefix?: string;
}

const SAFE_OUTCOME_KEYS = new Set(["status", "code", "errorCode", "retryable", "id", "jobId", "messageId"]);

export function summarizeOutcome(outcome: unknown): unknown {
  if (outcome === null || typeof outcome !== "object") return outcome;
  if (Array.isArray(outcome)) return { status: "COMPLETED", itemCount: outcome.length };
  const record = outcome as Record<string, unknown>;
  const summary = Object.fromEntries(
    Object.entries(record).filter(([key, value]) => SAFE_OUTCOME_KEYS.has(key) && ["string", "number", "boolean"].includes(typeof value)),
  );
  return { status: "COMPLETED", ...summary };
}

export function createIdempotencyGuard(
  repository: InboxRepository,
  options: IdempotencyGuardOptions,
) {
  const scopedHandlerName = `${options.queuePrefix ?? process.env.QUEUE_PREFIX?.trim() ?? "development"}:${options.handlerName}`;
  return async function guard<T>(
    envelope: MessageEnvelope<T>,
    handler: (envelope: MessageEnvelope<T>) => Promise<unknown>,
  ): Promise<unknown> {
    const state = await repository.tryStart({
      workspaceId: envelope.workspaceId,
      messageId: envelope.messageId,
      handlerName: scopedHandlerName,
      handlerVersion: options.handlerVersion,
    });
    if (!state.acquired) return state.priorOutcome;
    let outcome: unknown;
    try {
      outcome = await handler(envelope);
    } catch (error) {
      await repository.release({
        workspaceId: envelope.workspaceId,
        messageId: envelope.messageId,
        handlerName: scopedHandlerName,
        handlerVersion: options.handlerVersion,
      });
      throw error;
    }
    await repository.complete({
      workspaceId: envelope.workspaceId,
      messageId: envelope.messageId,
      handlerName: scopedHandlerName,
      handlerVersion: options.handlerVersion,
      outcome: summarizeOutcome(outcome),
    });
    return outcome;
  };
}
