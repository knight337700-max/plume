export interface MessageConsumption {
  readonly workspaceId: string;
  readonly messageId: string;
  readonly handlerName: string;
  readonly handlerVersion: string;
  readonly outcome: unknown;
  readonly processedAt: Date;
}

export interface InboxRepository {
  tryStart(input: {
    workspaceId: string;
    messageId: string;
    handlerName: string;
    handlerVersion: string;
  }): Promise<{ readonly acquired: boolean; readonly priorOutcome?: unknown }>;
  complete(input: {
    workspaceId: string;
    messageId: string;
    handlerName: string;
    handlerVersion: string;
    outcome: unknown;
  }): Promise<void>;
}
