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
import {
  createInMemoryCampaignRepositories,
  type CampaignRepositories,
} from "../../../packages/core/src/modules/campaign/repositories.js";
import {
  createInMemoryAssetRepositories,
  type AssetRepositories,
} from "../../../packages/core/src/modules/asset/repositories.js";
import {
  createInMemoryCreativeRepositories,
  type CreativeRepositories,
} from "../../../packages/core/src/modules/creative/repositories.js";
import {
  createInMemoryClientBrandRepositories,
  type ClientBrandRepositories,
} from "../../../packages/core/src/modules/client-brand/repositories.js";
import { PostgresUploadSessionRepository } from "../../../packages/infrastructure/src/db/upload-session-repository.js";
import { DrizzleCreativeRepositories } from "../../../packages/infrastructure/src/db/creative-drizzle-repositories.js";
import { DrizzleProjectContextReaders } from "../../../packages/infrastructure/src/db/project-context-drizzle-repositories.js";
import type { FileObjectRecord } from "../../../packages/core/src/modules/asset/upload-session.js";
import type { AgentProviderGateway } from "../../../packages/core/src/agents/orchestrator.js";
import {
  createProjectAwareCreativeGenerateHandler,
  createProjectAwareCreativeRenderHandler,
  createProjectDurableAssetRepositories,
  createProjectDurableCampaignRepositories,
  currentProjectGenerationExecutionContext,
  createSnapshotAwareCampaignRepositories,
} from "./project-generation-execution.js";

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
  readonly campaignRepositories?: CampaignRepositories;
  readonly assetRepositories?: AssetRepositories;
  readonly creativeRepositories?: CreativeRepositories;
  readonly clientBrandRepositories?: ClientBrandRepositories;
  /** Additive test/local seam; omitted production composition keeps the configured runtime. */
  readonly providerGateway?: AgentProviderGateway;
  readonly providerMode?: "mock" | "live";
  readonly fileObjectReader?: {
    getFileObject(workspaceId: string, fileObjectId: string): Promise<FileObjectRecord | null>;
  };
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
  const campaignDelegate = options.campaignRepositories ?? createInMemoryCampaignRepositories();
  const assetDelegate = options.assetRepositories ?? createInMemoryAssetRepositories();
  const projectReaders = new DrizzleProjectContextReaders(sql);
  const campaignRepositories = createProjectDurableCampaignRepositories(
    campaignDelegate,
    projectReaders,
  );
  const assetRepositories = createProjectDurableAssetRepositories(assetDelegate, projectReaders);
  const creativeRepositories = new DrizzleCreativeRepositories(
    sql,
    {},
    currentProjectGenerationExecutionContext,
    options.creativeRepositories ?? createInMemoryCreativeRepositories(),
  );
  const clientBrandRepositories =
    options.clientBrandRepositories ?? createInMemoryClientBrandRepositories();
  const fileObjectReader = options.fileObjectReader ?? new PostgresUploadSessionRepository(sql);
  const outboxDispatcher = createOutboxDispatcher(new DrizzleOutboxRepository(sql), adapter, {
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 500),
    batchLimit: Number(process.env.OUTBOX_BATCH_LIMIT ?? 50),
    leaseMs: Number(process.env.OUTBOX_LEASE_MS ?? 30_000),
  });
  const runtimeEnvironment =
    options.providerMode === undefined
      ? process.env
      : { ...process.env, OPENAI_PROVIDER_MODE: options.providerMode };
  const aiRuntime = createWorkerAIRuntime({ environment: runtimeEnvironment });
  const providerGateway = options.providerGateway ?? aiRuntime.provider.gateway;
  const providerMode = options.providerMode ?? aiRuntime.provider.mode;
  const pricingPolicy = createLiveSmokePricingPolicy(runtimeEnvironment);
  const snapshotAwareCampaignRepositories =
    createSnapshotAwareCampaignRepositories(campaignRepositories);
  const frozenHandlers = createJacomoRuntimeHandlers({
    sql,
    publisher,
    storage,
    workflow,
    queuePrefix: adapter.queuePrefix,
    providerGateway,
    liveSmokeBudgetStore,
    liveSmokeCoverageStore,
    liveSmokeLifecycleStore,
    liveSmokeValidationEvidenceStore,
    liveSmokeFailureEvidenceStore,
    campaignRepositories: snapshotAwareCampaignRepositories,
    assetRepositories,
    creativeRepositories,
    clientBrandRepositories,
    fileObjectReader,
    providerMode,
    ...(pricingPolicy ? { pricingPolicy } : {}),
  });
  const handlers = Object.freeze({
    ...frozenHandlers,
    "creative.generate": createProjectAwareCreativeGenerateHandler({
      sql,
      inner: frozenHandlers["creative.generate"]!,
    }),
    "creative.render": createProjectAwareCreativeRenderHandler({
      sql,
      inner: frozenHandlers["creative.render"]!,
    }),
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
        if (providerMode === "live" && !pricingPolicy)
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
