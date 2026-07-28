export interface MessageEnvelope<TPayload = unknown> {
  readonly messageId: string;
  readonly schemaVersion: number;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly jobId: string;
  readonly jobItemId?: string;
  readonly createdAt: string;
  readonly payload: TPayload;
}

export interface CommandEnvelope<TPayload = unknown> extends MessageEnvelope<TPayload> {
  readonly command: string;
}

export interface EventEnvelope<TPayload = unknown> extends MessageEnvelope<TPayload> {
  readonly event: string;
}

export function createMessageEnvelope<TPayload>(
  input: MessageEnvelope<TPayload>,
): MessageEnvelope<TPayload> {
  if (!input.messageId || !input.workspaceId || !input.correlationId || !input.jobId) {
    throw new Error("messageId, workspaceId, correlationId, and jobId are required");
  }
  if (input.schemaVersion < 1) throw new Error("schemaVersion must be positive");
  return Object.freeze({ ...input });
}
