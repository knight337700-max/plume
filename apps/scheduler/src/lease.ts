import Redis from "ioredis";

const RENEW_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
  end
  return 0
`;
const RELEASE_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

export interface RedisLeaseClient {
  set(key: string, value: string, mode: "PX", ttlMs: number, condition: "NX"): Promise<"OK" | null>;
  eval(script: string, keyCount: number, key: string, owner: string, ttlMs: string): Promise<number>;
  quit(): Promise<unknown>;
}

type RedisRuntimeClient = RedisLeaseClient & {
  readonly status?: string;
  connect?: () => Promise<unknown>;
  disconnect?: () => void;
  once?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

async function ensureReady(client: RedisLeaseClient): Promise<void> {
  const runtime = client as RedisRuntimeClient;
  if (runtime.status === undefined || runtime.status === "ready") return;
  if (runtime.status === "wait" && runtime.connect) await runtime.connect();
  if (runtime.status === "ready" || !runtime.once) return;
  await new Promise<void>((resolve, reject) => {
    runtime.once?.("ready", () => resolve());
    runtime.once?.("error", (error) => reject(error));
  });
}

export interface SchedulerLease {
  readonly key: string;
  readonly owner: string;
  readonly ttlMs: number;
  acquire(): Promise<boolean>;
  renew(): Promise<boolean>;
  release(): Promise<void>;
  isOwner(): boolean;
  close(): Promise<void>;
}

export interface SchedulerLeaseOptions {
  readonly key?: string;
  readonly owner?: string;
  readonly ttlMs?: number;
  readonly redisUrl?: string;
  readonly client?: RedisLeaseClient;
}

export function createSchedulerLease(options: SchedulerLeaseOptions = {}): SchedulerLease {
  const key = options.key ?? `${process.env.QUEUE_PREFIX?.trim() || "development"}:scheduler:lease`;
  const owner = options.owner ?? crypto.randomUUID();
  const ttlMs = Math.max(5_000, options.ttlMs ?? 90_000);
  const client = (options.client ?? new Redis(options.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })) as RedisLeaseClient;
  let owned = false;

  return {
    key,
    owner,
    ttlMs,
    async acquire() {
      await ensureReady(client);
      const result = await client.set(key, owner, "PX", ttlMs, "NX");
      owned = result === "OK";
      return owned;
    },
    async renew() {
      if (!owned) return false;
      const result = await client.eval(RENEW_SCRIPT, 1, key, owner, String(ttlMs));
      owned = result === 1;
      return owned;
    },
    async release() {
      if (owned) await client.eval(RELEASE_SCRIPT, 1, key, owner, "0");
      owned = false;
    },
    isOwner() {
      return owned;
    },
    async close() {
      const runtime = client as RedisRuntimeClient;
      if (runtime.status === "end") return;
      try {
        await client.quit();
      } catch {
        runtime.disconnect?.();
      }
    },
  };
}

export const schedulerLeaseScripts = Object.freeze({ renew: RENEW_SCRIPT, release: RELEASE_SCRIPT });
