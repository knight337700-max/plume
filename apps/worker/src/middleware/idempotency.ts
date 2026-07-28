import type { InboxRepository } from "../../../../packages/core/src/modules/operations/inbox-repository.js";
import type { MessageEnvelope } from "../../../../packages/core/src/async/message-envelope.js";

export interface IdempotencyGuardOptions {
  readonly handlerName: string;
  readonly handlerVersion: string;
}

export function createIdempotencyGuard(
  repository: InboxRepository,
  options: IdempotencyGuardOptions,
) {
  return async function guard<T>(
    envelope: MessageEnvelope<T>,
    handler: (envelope: MessageEnvelope<T>) => Promise<unknown>,
  ): Promise<unknown> {
    const state = await repository.tryStart({
      workspaceId: envelope.workspaceId,
      messageId: envelope.messageId,
      handlerName: options.handlerName,
      handlerVersion: options.handlerVersion,
    });
    if (!state.acquired) return state.priorOutcome;
    const outcome = await handler(envelope);
    await repository.complete({
      workspaceId: envelope.workspaceId,
      messageId: envelope.messageId,
      handlerName: options.handlerName,
      handlerVersion: options.handlerVersion,
      outcome,
    });
    return outcome;
  };
}
