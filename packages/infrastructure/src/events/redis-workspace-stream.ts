export const WORKSPACE_EVENT_TYPES = Object.freeze([
  "job.progressed", "job.completed", "job.failed", "creative.generated", "validation.completed",
  "approval.requested", "approval.approved", "approval.rejected", "approval.superseded",
  "export.completed", "export.failed", "notification.created", "catalog.integrity.failed",
] as const);

export type WorkspaceEventType = (typeof WORKSPACE_EVENT_TYPES)[number];
export const WORKSPACE_EVENT_HEARTBEAT_SECONDS = 20;
export const WORKSPACE_EVENT_RETENTION_HOURS = 24;

export interface WorkspaceEventPayload {
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly correlationId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface WorkspaceEvent {
  readonly id: string;
  readonly event: WorkspaceEventType;
  readonly data: WorkspaceEventPayload;
}

export interface AppendWorkspaceEventInput {
  readonly workspaceId: string;
  readonly event: WorkspaceEventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly correlationId?: string | null;
  readonly occurredAt?: string;
}

export interface WorkspaceEventStream {
  append(input: AppendWorkspaceEventInput): Promise<WorkspaceEvent>;
  read(workspaceId: string, lastEventId?: string | null, now?: Date): Promise<readonly WorkspaceEvent[]>;
  subscribe(workspaceId: string, listener: (event: WorkspaceEvent) => void): () => void;
}

const REQUIRED_FIELDS: Readonly<Record<WorkspaceEventType, readonly string[]>> = Object.freeze({
  "job.progressed": ["jobId", "status", "progressPercent", "currentStep"],
  "job.completed": ["jobId", "status", "subjectType", "subjectId"],
  "job.failed": ["jobId", "status", "errorCode", "retryable"],
  "creative.generated": ["jobId", "creativeId", "creativeVersionId", "productId"],
  "validation.completed": ["jobId", "validationRunId", "creativeVersionId", "status", "errorCount", "warningCount"],
  "approval.requested": ["approvalId", "creativeVersionId", "assigneeId"],
  "approval.approved": ["approvalId", "creativeVersionId", "decidedBy"],
  "approval.rejected": ["approvalId", "creativeVersionId", "decidedBy"],
  "approval.superseded": ["approvalId", "creativeVersionId", "supersededBy"],
  "export.completed": ["jobId", "exportJobId", "fileCount", "expiresAt"],
  "export.failed": ["jobId", "exportJobId", "errorCode", "retryable"],
  "notification.created": ["notificationId", "notificationType", "deepLink"],
  "catalog.integrity.failed": ["jobId", "errorCount", "reportId"],
});

function validatePayload(event: WorkspaceEventType, payload: Readonly<Record<string, unknown>>): void {
  const missing = REQUIRED_FIELDS[event].filter((field) => payload[field] === undefined);
  if (missing.length > 0) throw new Error(`Missing ${event} payload fields: ${missing.join(", ")}`);
}

function sequence(id: string): number {
  const value = Number(id.replace(/^evt_/, ""));
  return Number.isFinite(value) ? value : 0;
}

function eventId(value: number): string {
  return `evt_${String(value).padStart(16, "0")}`;
}

export class InMemoryWorkspaceEventStream implements WorkspaceEventStream {
  private readonly events = new Map<string, WorkspaceEvent[]>();
  private readonly listeners = new Map<string, Set<(event: WorkspaceEvent) => void>>();
  private nextId = 1;

  public constructor(private readonly retentionHours = WORKSPACE_EVENT_RETENTION_HOURS, private readonly clock: () => Date = () => new Date()) {}

  async append(input: AppendWorkspaceEventInput): Promise<WorkspaceEvent> {
    validatePayload(input.event, input.payload);
    const event: WorkspaceEvent = Object.freeze({ id: eventId(this.nextId++), event: input.event, data: Object.freeze({ schemaVersion: 1, occurredAt: input.occurredAt ?? this.clock().toISOString(), workspaceId: input.workspaceId, correlationId: input.correlationId ?? null, payload: Object.freeze({ ...input.payload }) }) });
    const items = this.events.get(input.workspaceId) ?? [];
    items.push(event);
    this.events.set(input.workspaceId, items);
    this.prune(input.workspaceId, this.clock());
    for (const listener of this.listeners.get(input.workspaceId) ?? []) listener(event);
    return event;
  }

  async read(workspaceId: string, lastEventId?: string | null, now = this.clock()): Promise<readonly WorkspaceEvent[]> {
    this.prune(workspaceId, now);
    const after = lastEventId ? sequence(lastEventId) : 0;
    return [...(this.events.get(workspaceId) ?? [])].filter((event) => sequence(event.id) > after);
  }

  subscribe(workspaceId: string, listener: (event: WorkspaceEvent) => void): () => void {
    const listeners = this.listeners.get(workspaceId) ?? new Set<(event: WorkspaceEvent) => void>();
    listeners.add(listener);
    this.listeners.set(workspaceId, listeners);
    return () => { listeners.delete(listener); };
  }

  private prune(workspaceId: string, now: Date): void {
    const cutoff = now.getTime() - this.retentionHours * 60 * 60 * 1000;
    const retained = (this.events.get(workspaceId) ?? []).filter((event) => Date.parse(event.data.occurredAt) >= cutoff);
    this.events.set(workspaceId, retained);
  }
}

export interface RedisWorkspaceStreamStorage {
  append(streamKey: string, event: WorkspaceEvent): Promise<string>;
  read(streamKey: string, lastEventId?: string | null): Promise<readonly WorkspaceEvent[]>;
  trim(streamKey: string, olderThan: Date): Promise<void>;
}

/** Thin Redis Streams seam; production wiring supplies XADD/XRANGE/XTRIM commands. */
export class RedisWorkspaceEventStream implements WorkspaceEventStream {
  public constructor(private readonly storage: RedisWorkspaceStreamStorage, private readonly keyPrefix = "plume:workspace-events", private readonly retentionHours = WORKSPACE_EVENT_RETENTION_HOURS, private readonly clock: () => Date = () => new Date()) {}
  async append(input: AppendWorkspaceEventInput): Promise<WorkspaceEvent> {
    validatePayload(input.event, input.payload);
    const event: WorkspaceEvent = { id: "", event: input.event, data: { schemaVersion: 1, occurredAt: input.occurredAt ?? this.clock().toISOString(), workspaceId: input.workspaceId, correlationId: input.correlationId ?? null, payload: { ...input.payload } } };
    const id = await this.storage.append(this.key(input.workspaceId), event);
    await this.storage.trim(this.key(input.workspaceId), new Date(this.clock().getTime() - this.retentionHours * 60 * 60 * 1000));
    return { ...event, id };
  }
  async read(workspaceId: string, lastEventId?: string | null): Promise<readonly WorkspaceEvent[]> { return this.storage.read(this.key(workspaceId), lastEventId); }
  subscribe(_workspaceId: string, _listener: (event: WorkspaceEvent) => void): () => void { return () => undefined; }
  private key(workspaceId: string): string { return `${this.keyPrefix}:${workspaceId}`; }
}

export const createInMemoryWorkspaceEventStream = (options?: { readonly retentionHours?: number; readonly clock?: () => Date }): InMemoryWorkspaceEventStream => new InMemoryWorkspaceEventStream(options?.retentionHours, options?.clock);

