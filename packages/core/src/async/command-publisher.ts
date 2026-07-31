import type { AsyncCommand } from "./queue-routing.js";

export interface EnqueueCommandInput<TPayload = unknown> {
  readonly workspaceId: string;
  readonly command: AsyncCommand;
  readonly schemaVersion: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly jobId?: string;
  readonly jobItemId?: string;
  readonly payload: TPayload;
  readonly requestedBy?: string;
  readonly idempotencyKey?: string;
}

export interface EnqueuedCommand {
  readonly jobId: string;
  readonly jobItemId: string;
  readonly messageId: string;
  readonly status: "QUEUED";
  readonly correlationId: string;
}

export interface AsyncCommandPublisher {
  enqueue<TPayload>(input: EnqueueCommandInput<TPayload>): Promise<EnqueuedCommand>;
}
