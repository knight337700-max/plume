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
  PostgresLiveSmokeCoverageStore,
  type LiveSmokeCoverageStore,
} from "../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import {
  PostgresLiveSmokeLifecycleStore,
  type LiveSmokeLifecycleStore,
} from "../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";
import {
  PostgresLiveSmokeValidationEvidenceStore,
  type LiveSmokeValidationEvidenceStore,
} from "../../../packages/infrastructure/src/async/live-smoke-validation-evidence-store.js";
import {
  S3ObjectStorage,
  type ObjectStorage,
} from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { STAGING_ENABLED_JOB_TYPES, type RuntimeJobHandler } from "./runtime-registry.js";
import { createJacomoRuntimeHandlers } from "./handlers/jacomo-runtime.js";
import { createOutboxDispatcher } from "./outbox-dispatcher.js";
import { createWorkerAIRuntime } from "./ai-runtime.js";
import type { WorkerReadinessCheck } from "./bootstrap.js";
import { loadEnvironment, type Environment } from "../../../packages/config/src/index.js";
import { createLiveSmokePricingPolicy } from "../../../packages/infrastructure/src/async/live-smoke-spend-policy.js";
import {
  PostgresLiveSmokeFailureEvidenceStore,
  type LiveSmokeFailureEvidenceStore,
} from "../../../packages/infrastructure/src/async/live-smoke-failure-evidence-store.js";

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
  readonly liveSmokeCoverageStore?: LiveSmokeCoverageStore;
  readonly liveSmokeLifecycleStore?: LiveSmokeLifecycleStore;
  readonly liveSmokeValidationEvidenceStore?: LiveSmokeValidationEvidenceStore;
  readonly liveSmokeFailureEvidenceStore?: LiveSmokeFailureEvidenceStore;
}

function envValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function createWorkerRuntimeComposition(
  options: WorkerRuntimeCompositionOptions = {},
): WorkerRuntimeComposition {
  const productionEnvironment: Environment | undefined =
    process.env.APP_ENV?.trim() === "production" ? loadEnvironment(process.env) : undefined;
  const ownedDatabase = options.sql ? undefined : createDatabaseClient();
  const sql = options.sql ?? ownedDatabase!.sql;
  const adapter =
    options.adapter ??
    createBullMqAdapter({
      ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
      prefix: productionEnvironment?.queuePrefix ?? envValue("QUEUE_PREFIX", "plume-staging"),
    });
  const storage =
    options.storage ??
    new S3ObjectStorage({
      endpoint:
        productionEnvironment?.s3Endpoint ?? envValue("S3_ENDPOINT", "http://localhost:9000"),
      bucket: productionEnvironment?.s3Bucket ?? envValue("S3_BUCKET", "plume-staging"),
      accessKeyId: productionEnvironment?.s3AccessKeyId ?? envValue("S3_ACCESS_KEY_ID", "plume"),
      secretAccessKey:
        productionEnvironment?.s3SecretAccessKey ??
        envValue("S3_SECRET_ACCESS_KEY", "plume_local_only"),
    });
  const publisher = options.publisher ?? new DurableAsyncCommandPublisher(sql);
  const workflow = options.workflow ?? new DurableWorkflowRepository(sql);
  const liveSmokeBudgetStore =
    options.liveSmokeBudgetStore ?? new PostgresLiveSmokeBudgetStore(sql);
  const liveSmokeCoverageStore =
    options.liveSmokeCoverageStore ?? new PostgresLiveSmokeCoverageStore(sql);
  const liveSmokeLifecycleStore =
    options.liveSmokeLifecycleStore ?? new PostgresLiveSmokeLifecycleStore(sql);
  const liveSmokeValidationEvidenceStore =
    options.liveSmokeValidationEvidenceStore ?? new PostgresLiveSmokeValidationEvidenceStore(sql);
  const liveSmokeFailureEvidenceStore =
    options.liveSmokeFailureEvidenceStore ?? new PostgresLiveSmokeFailureEvidenceStore(sql);
  const outboxDispatcher = createOutboxDispatcher(new DrizzleOutboxRepository(sql), adapter, {
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 500),
    batchLimit: Number(process.env.OUTBOX_BATCH_LIMIT ?? 50),
    leaseMs: Number(process.env.OUTBOX_LEASE_MS ?? 30_000),
  });
  const aiRuntime = createWorkerAIRuntime({ environment: process.env });
  const pricingPolicy = createLiveSmokePricingPolicy(process.env);
  const handlers = createJacomoRuntimeHandlers({
    sql,
    publisher,
    storage,
    workflow,
    queuePrefix: adapter.queuePrefix,
    providerGateway: aiRuntime.provider.gateway,
    liveSmokeBudgetStore,
    liveSmokeCoverageStore,
    liveSmokeLifecycleStore,
    liveSmokeValidationEvidenceStore,
    liveSmokeFailureEvidenceStore,
    providerMode: aiRuntime.provider.mode,
    ...(pricingPolicy ? { pricingPolicy } : {}),
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
    {
      name: "spend-ledger",
      check: async () => {
        if (aiRuntime.provider.mode === "live" && !pricingPolicy)
          throw new Error("LIVE_SMOKE_PRICING_POLICY_REQUIRED");
        await sql`SELECT to_regclass('public.live_smoke_spend_ledger')`;
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
