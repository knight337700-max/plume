import type { Sql } from "postgres";
import { createDatabaseClient } from "../../../packages/db/src/client.js";
import {
  createBullMqAdapter,
  type BullMqAdapter,
} from "../../../packages/infrastructure/src/queue/bullmq.js";
import { DrizzleOutboxRepository } from "../../../packages/infrastructure/src/db/outbox-drizzle-repository.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { DurableWorkflowRepository } from "../../../packages/infrastructure/src/async/durable-workflow-repository.js";
import {
  PostgresLiveSmokeBudgetStore,
  type LiveSmokeBudgetStore,
} from "../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import {
  S3ObjectStorage,
  type ObjectStorage,
} from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { STAGING_ENABLED_JOB_TYPES, type RuntimeJobHandler } from "./runtime-registry.js";
import { createJacomoRuntimeHandlers } from "./handlers/jacomo-runtime.js";
import { createOutboxDispatcher } from "./outbox-dispatcher.js";
import { createWorkerAIRuntime } from "./ai-runtime.js";
import type { WorkerReadinessCheck } from "./bootstrap.js";

export interface WorkerRuntimeComposition {
  readonly sql: Sql;
  readonly adapter: BullMqAdapter;
  readonly handlers: Readonly<Record<string, RuntimeJobHandler>>;
  readonly enabledJobTypes: readonly string[];
  readonly readinessChecks: readonly WorkerReadinessCheck[];
  readonly outboxDispatcher: ReturnType<typeof createOutboxDispatcher>;
  close(): Promise<void>;
}

export interface WorkerRuntimeCompositionOptions {
  readonly sql?: Sql;
  readonly adapter?: BullMqAdapter;
  readonly storage?: ObjectStorage;
  readonly publisher?: DurableAsyncCommandPublisher;
  readonly workflow?: DurableWorkflowRepository;
  readonly liveSmokeBudgetStore?: LiveSmokeBudgetStore;
}

function envValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function createWorkerRuntimeComposition(
  options: WorkerRuntimeCompositionOptions = {},
): WorkerRuntimeComposition {
  const ownedDatabase = options.sql ? undefined : createDatabaseClient();
  const sql = options.sql ?? ownedDatabase!.sql;
  const adapter =
    options.adapter ??
    createBullMqAdapter({
      ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
      prefix: envValue("QUEUE_PREFIX", "plume-staging"),
    });
  const storage =
    options.storage ??
    new S3ObjectStorage({
      endpoint: envValue("S3_ENDPOINT", "http://localhost:9000"),
      bucket: envValue("S3_BUCKET", "plume-staging"),
      accessKeyId: envValue("S3_ACCESS_KEY_ID", "plume"),
      secretAccessKey: envValue("S3_SECRET_ACCESS_KEY", "plume_local_only"),
    });
  const publisher = options.publisher ?? new DurableAsyncCommandPublisher(sql);
  const workflow = options.workflow ?? new DurableWorkflowRepository(sql);
  const liveSmokeBudgetStore =
    options.liveSmokeBudgetStore ?? new PostgresLiveSmokeBudgetStore(sql);
  const outboxDispatcher = createOutboxDispatcher(new DrizzleOutboxRepository(sql), adapter, {
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 500),
    batchLimit: Number(process.env.OUTBOX_BATCH_LIMIT ?? 50),
    leaseMs: Number(process.env.OUTBOX_LEASE_MS ?? 30_000),
  });
  const aiRuntime = createWorkerAIRuntime();
  const handlers = createJacomoRuntimeHandlers({
    sql,
    publisher,
    storage,
    workflow,
    queuePrefix: adapter.queuePrefix,
    providerGateway: aiRuntime.provider.gateway,
    liveSmokeBudgetStore,
  });
  let closed = false;

  const readinessChecks: readonly WorkerReadinessCheck[] = Object.freeze([
    {
      name: "database",
      check: async () => {
        await sql`SELECT 1`;
      },
    },
    {
      name: "redis",
      check: async () => {
        await adapter.getQueue("readiness").waitUntilReady();
      },
    },
    {
      name: "object-storage",
      check: async () => {
        if (storage instanceof S3ObjectStorage) await storage.checkBucket();
      },
    },
  ]);

  return {
    sql,
    adapter,
    handlers,
    enabledJobTypes: STAGING_ENABLED_JOB_TYPES,
    readinessChecks,
    outboxDispatcher,
    async close() {
      if (closed) return;
      closed = true;
      await outboxDispatcher.stop();
      if (ownedDatabase) await ownedDatabase.sql.end({ timeout: 5 });
    },
  };
}
