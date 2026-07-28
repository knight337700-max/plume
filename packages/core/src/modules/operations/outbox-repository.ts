export interface OutboxMessage {
  readonly id: string;
  readonly workspaceId: string;
  readonly topic: string;
  readonly messageKey: string;
  readonly messageType: string;
  readonly schemaVersion: number;
  readonly payloadJson: Readonly<Record<string, unknown>>;
  readonly headersJson: Readonly<Record<string, unknown>>;
  readonly availableAt: Date;
  readonly publishedAt?: Date;
  readonly attemptCount: number;
  readonly lastError?: string;
  readonly createdAt: Date;
  readonly leaseExpiresAt?: Date;
}

export interface NewOutboxMessage {
  readonly workspaceId: string;
  readonly topic: string;
  readonly messageKey: string;
  readonly messageType: string;
  readonly schemaVersion: number;
  readonly payloadJson: Readonly<Record<string, unknown>>;
  readonly headersJson?: Readonly<Record<string, unknown>>;
  readonly availableAt?: Date;
}

export interface OutboxRepository {
  insert(message: NewOutboxMessage): Promise<OutboxMessage>;
  claim(limit: number, leaseMs: number): Promise<readonly OutboxMessage[]>;
  markPublished(id: string, publishedAt?: Date): Promise<void>;
  markFailed(id: string, error: string, availableAt: Date): Promise<void>;
}
