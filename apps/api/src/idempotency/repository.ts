import { createHash } from "node:crypto";

export interface IdempotencyRecord {
  readonly workspaceId: string;
  readonly key: string;
  readonly requestHash: string;
  readonly statusCode: number;
  readonly responseBody: unknown;
}

export interface IdempotencyRepository {
  find(workspaceId: string, key: string): Promise<IdempotencyRecord | null>;
  insert(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();
  private readonly locks = new Map<string, Promise<void>>();

  async find(workspaceId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(`${workspaceId}:${key}`) ?? null;
  }

  async insert(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    const identity = `${record.workspaceId}:${record.key}`;
    const prior = this.records.get(identity);
    if (prior) return prior;
    const previous = this.locks.get(identity) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      identity,
      previous.then(() => lock),
    );
    await previous;
    try {
      const current = this.records.get(identity);
      if (current) return current;
      this.records.set(identity, record);
      return record;
    } finally {
      release();
      this.locks.delete(identity);
    }
  }
}
