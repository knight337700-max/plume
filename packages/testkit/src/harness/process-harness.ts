/* eslint-disable no-restricted-imports -- The real-process harness composes source-level runtime adapters. */
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import postgres, { type Sql } from "postgres";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../../apps/api/src/app.js";
import { createSchedulerBootstrap } from "../../../../apps/scheduler/src/main.js";
import { createSchedulerLease } from "../../../../apps/scheduler/src/lease.js";
import { createWorkerBootstrap } from "../../../../apps/worker/src/bootstrap.js";
import { createRuntimeHandlerRegistry } from "../../../../apps/worker/src/runtime-registry.js";
import { createWorkerRuntimeComposition } from "../../../../apps/worker/src/composition.js";
import { outboxToCommandEnvelope } from "../../../../apps/worker/src/handlers/outbox/publish-outbox.js";
import { createBullMqAdapter } from "../../../infrastructure/src/queue/bullmq.js";
import { DurableAsyncCommandPublisher } from "../../../infrastructure/src/async/durable-command-publisher.js";
import { DurableJobQueryRepository } from "../../../infrastructure/src/db/durable-job-query-repository.js";
import { S3ObjectStorage } from "../../../infrastructure/src/storage/s3-object-storage.js";
import { createUploadUseCases } from "../../../core/src/modules/asset/upload-use-cases.js";
import { createUploadVerifier } from "../../../infrastructure/src/files/verify-upload.js";
import { PostgresUploadSessionRepository } from "../../../infrastructure/src/db/upload-session-repository.js";
import { createInMemoryCampaignRepositories } from "../../../core/src/modules/campaign/repositories.js";
import { createInMemoryAssetRepositories } from "../../../core/src/modules/asset/repositories.js";
import { createInMemoryCreativeRepositories } from "../../../core/src/modules/creative/repositories.js";
import type { CampaignRepositories } from "../../../core/src/modules/campaign/repositories.js";
import type { AssetRepositories } from "../../../core/src/modules/asset/repositories.js";
import { DrizzleProjectRepositories } from "../../../infrastructure/src/db/project-drizzle-repositories.js";
import { DrizzleProjectContextReaders } from "../../../infrastructure/src/db/project-context-drizzle-repositories.js";
import { DrizzleProjectCreativeQueryRepository } from "../../../infrastructure/src/db/project-creative-query-drizzle-repository.js";
import { DrizzleProjectGenerationContext } from "../../../infrastructure/src/db/project-generation-context-drizzle-repository.js";
import { DrizzleProjectFormatBindingResolver } from "../../../infrastructure/src/db/project-format-binding-resolver.js";
import { DrizzleCreativeRepositories } from "../../../infrastructure/src/db/creative-drizzle-repositories.js";
import { CreativeRenderArtifactDownload } from "../../../infrastructure/src/db/creative-render-download.js";
import { createProjectUseCases } from "../../../core/src/modules/project/project-use-cases.js";
import { createProjectGenerationPreparer } from "../../../core/src/modules/project/project-generation-preparer.js";
import type { ClientBrandRepositories } from "../../../core/src/modules/client-brand/repositories.js";
import type { AgentProviderGateway } from "../../../core/src/agents/orchestrator.js";
import { createJobUseCases } from "../../../core/src/modules/operations/job-use-cases.js";
import {
  startMockOpenAIServer,
  type MockOpenAIServer,
  type MockOpenAIScenario,
} from "../ai/mock-openai-server.js";

export interface HarnessService {
  readonly name: string;
  readonly url: string;
  readonly port: number;
  readonly status: "ready";
}
export interface ProcessHarnessOptions {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly minioUrl?: string;
  readonly mockScenario?: MockOpenAIScenario;
  readonly workerProviderGateway?: AgentProviderGateway;
  readonly workerProviderMode?: "mock" | "live";
  readonly clientBrandRepositories?: ClientBrandRepositories;
  /** Browser-test composition seam. Production paths are unchanged. */
  readonly durableProjectComposition?: boolean;
  readonly campaignRepositories?: CampaignRepositories;
  readonly assetRepositories?: AssetRepositories;
}
export interface ProcessHarness {
  readonly services: Readonly<Record<string, HarnessService>>;
  readonly mockOpenAI: MockOpenAIServer;
  readonly logs: readonly string[];
  readonly database: Sql;
  request(path: string, init?: RequestInit): Promise<Response>;
  getObject(objectKey: string): Promise<Uint8Array>;
  putObject(objectKey: string, body: Uint8Array, contentType: string): Promise<void>;
  replayMessage(messageId: string): Promise<void>;
  exerciseDeadLetter(): Promise<boolean>;
  close(): Promise<void>;
}

const defaultDatabaseUrl = "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const defaultRedisUrl = "redis://localhost:6379";
const defaultMinioUrl = "http://localhost:9000";

function redact(value: string): string {
  return value.replace(/(password|secret|api[_-]?key|token)=?[^\s&]+/gi, "$1=[REDACTED]");
}
function tcpReady(host: string, port: number, timeoutMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP readiness timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
async function waitFor(check: () => Promise<void>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(
    `readiness deadline exceeded: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
export async function startProcessHarness(
  options: ProcessHarnessOptions = {},
): Promise<ProcessHarness> {
  const databaseUrl = options.databaseUrl ?? process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl;
  const redisUrl = new URL(options.redisUrl ?? process.env.REDIS_URL ?? defaultRedisUrl);
  const minioUrl = options.minioUrl ?? process.env.S3_ENDPOINT ?? defaultMinioUrl;
  const logs: string[] = [];
  let database: Sql | null = null;
  let api: FastifyInstance | null = null;
  let workerBootstrap: ReturnType<typeof createWorkerBootstrap> | null = null;
  let workerComposition: ReturnType<typeof createWorkerRuntimeComposition> | null = null;
  let scheduler: ReturnType<typeof createSchedulerBootstrap> | null = null;
  const mockOpenAI = await startMockOpenAIServer(options.mockScenario ?? "jacomo-happy-path");
  try {
    database = postgres(databaseUrl, { max: 1 });
    await waitFor(async () => {
      await database!`SELECT 1`;
    });
    await waitFor(() => tcpReady(redisUrl.hostname, Number(redisUrl.port || 6379)));
    await waitFor(async () => {
      const response = await fetch(`${minioUrl}/minio/health/live`);
      if (!response.ok) throw new Error(`MinIO ${response.status}`);
    });
    const queuePrefix = `plume-test-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const storageBucket = `plume-test-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const storage = new S3ObjectStorage({
      endpoint: minioUrl,
      bucket: storageBucket,
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "plume",
      secretAccessKey:
        process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "plume_local_only",
    });
    const campaignRepositories =
      options.campaignRepositories ?? createInMemoryCampaignRepositories();
    const assetRepositories = options.assetRepositories ?? createInMemoryAssetRepositories();
    const creativeRepositories = createInMemoryCreativeRepositories();
    const clientBrandRepositories = options.clientBrandRepositories;
    const uploads = createUploadUseCases({
      repository: new PostgresUploadSessionRepository(database),
      storage,
      verifier: createUploadVerifier({ read: (objectKey) => storage.get(objectKey) }),
      bucket: storageBucket,
      filePolicy: {
        allowedMimeTypes: ["image/png", "image/jpeg", "text/plain", "text/csv"],
        maxBytes: 100 * 1024 * 1024,
        maxPixels: 100_000_000,
      },
    });
    const readinessObjectKey = `temp/harness-readiness-${randomUUID()}`;
    await storage.put({
      body: new Uint8Array([1]),
      contentType: "application/octet-stream",
      objectKey: readinessObjectKey,
    });
    await storage.deleteTemp(readinessObjectKey);

    const adapter = createBullMqAdapter({ redisUrl: redisUrl.toString(), prefix: queuePrefix });
    workerComposition = createWorkerRuntimeComposition({
      sql: database,
      adapter,
      storage,
      campaignRepositories,
      assetRepositories,
      creativeRepositories,
      ...(clientBrandRepositories ? { clientBrandRepositories } : {}),
      ...(options.workerProviderGateway ? { providerGateway: options.workerProviderGateway } : {}),
      ...(options.workerProviderMode ? { providerMode: options.workerProviderMode } : {}),
      fileObjectReader: new PostgresUploadSessionRepository(database),
    });
    const runtime = createRuntimeHandlerRegistry(
      workerComposition.handlers,
      workerComposition.enabledJobTypes,
      workerComposition.enabledJobTypes,
    );
    workerBootstrap = createWorkerBootstrap({
      adapter: workerComposition.adapter,
      handlers: runtime.registrations,
      requiredHandlerTypes: workerComposition.enabledJobTypes,
      readinessChecks: workerComposition.readinessChecks,
    });
    const workerHealth = await workerBootstrap.start();
    if (workerHealth.status !== "ready") {
      throw new Error(
        `worker readiness failed: ${workerHealth.failedChecks.join(",") || workerHealth.missingHandlerTypes.join(",")}`,
      );
    }
    await workerComposition.outboxDispatcher.start();

    const schedulerLease = createSchedulerLease({
      redisUrl: redisUrl.toString(),
      key: `${queuePrefix}:scheduler:lease`,
    });
    scheduler = createSchedulerBootstrap([], schedulerLease, [
      { name: "redis", check: () => tcpReady(redisUrl.hostname, Number(redisUrl.port || 6379)) },
    ]);
    if (!(await scheduler.start())) throw new Error("scheduler readiness failed");

    const publisher = new DurableAsyncCommandPublisher(database);
    const projectRepositories = options.durableProjectComposition
      ? new DrizzleProjectRepositories(database)
      : undefined;
    const durableCreativeRepositories = options.durableProjectComposition
      ? new DrizzleCreativeRepositories(database)
      : undefined;
    const projectContext = options.durableProjectComposition
      ? new DrizzleProjectContextReaders(database)
      : undefined;
    const projectUseCases =
      projectRepositories && projectContext
        ? createProjectUseCases({
            projects: projectRepositories,
            campaigns: projectContext,
            assets: projectContext,
          })
        : undefined;
    api = await buildApp({
      asyncCommandPublisher: publisher,
      jobs: createJobUseCases(new DurableJobQueryRepository(database)),
      uploads,
      campaignRepositories,
      assetRepositories,
      creativeRepositories: durableCreativeRepositories ?? creativeRepositories,
      ...(durableCreativeRepositories
        ? {
            renderArtifactDownloads: new CreativeRenderArtifactDownload({
              creativeRepositories: durableCreativeRepositories,
              fileObjects: new PostgresUploadSessionRepository(database),
              storage,
            }),
          }
        : {}),
      ...(projectRepositories ? { projectRepositories } : {}),
      ...(projectContext
        ? {
            projectCampaignContext: projectContext,
            projectAssetContext: projectContext,
            projectCreativeQueries: new DrizzleProjectCreativeQueryRepository(database),
          }
        : {}),
      ...(projectUseCases
        ? {
            projectGenerationPreparer: createProjectGenerationPreparer({
              projects: projectUseCases,
              campaigns: new DrizzleProjectGenerationContext(database),
            }),
            projectFormatBindings: new DrizzleProjectFormatBindingResolver(database),
          }
        : {}),
      ...(clientBrandRepositories ? { clientBrandRepositories } : {}),
    });
    const apiUrl = await api.listen({ host: "127.0.0.1", port: 0 });
    const parsedApiUrl = new URL(apiUrl);
    await waitFor(async () => {
      const response = await fetch(`${apiUrl}/api/v1/health`);
      if (!response.ok) throw new Error(`API ${response.status}`);
    });
    logs.push(
      redact(`api=${apiUrl} worker=process://${queuePrefix} scheduler=process://${queuePrefix}`),
    );
    const services = {
      postgres: {
        name: "postgres",
        url: databaseUrl,
        port: Number(new URL(databaseUrl).port || 5432),
        status: "ready" as const,
      },
      redis: {
        name: "redis",
        url: redisUrl.toString(),
        port: Number(redisUrl.port || 6379),
        status: "ready" as const,
      },
      minio: {
        name: "minio",
        url: minioUrl,
        port: Number(new URL(minioUrl).port || 9000),
        status: "ready" as const,
      },
      mockOpenAI: {
        name: "mock-openai",
        url: mockOpenAI.baseUrl,
        port: mockOpenAI.port,
        status: "ready" as const,
      },
      api: { name: "api", url: apiUrl, port: Number(parsedApiUrl.port), status: "ready" as const },
      worker: {
        name: "worker",
        url: `process://${queuePrefix}`,
        port: 0,
        status: "ready" as const,
      },
      scheduler: {
        name: "scheduler",
        url: `process://${queuePrefix}`,
        port: 0,
        status: "ready" as const,
      },
    };
    return {
      services,
      mockOpenAI,
      logs,
      database,
      request: (path, init) => fetch(`${apiUrl}${path}`, init),
      getObject: (objectKey) => storage.get(objectKey),
      putObject: async (objectKey, body, contentType) => {
        await storage.put({ objectKey, body, contentType });
      },
      replayMessage: async (messageId) => {
        const rows = await database!<Record<string, unknown>[]>`
          SELECT id, workspace_id, topic, message_key, message_type, schema_version,
            payload_json, headers_json, available_at, published_at, attempt_count,
            last_error, created_at, lease_expires_at
          FROM outbox_message WHERE message_key = ${messageId}
        `;
        const message = rows[0];
        if (!message) throw new Error(`outbox message not found: ${messageId}`);
        const envelope = outboxToCommandEnvelope({
          id: String(message.id),
          workspaceId: String(message.workspace_id),
          topic: String(message.topic),
          messageKey: String(message.message_key),
          messageType: String(message.message_type),
          schemaVersion: Number(message.schema_version),
          payloadJson: message.payload_json as Record<string, unknown>,
          headersJson: message.headers_json as Record<string, unknown>,
          availableAt: new Date(String(message.available_at)),
          ...(message.published_at ? { publishedAt: new Date(String(message.published_at)) } : {}),
          attemptCount: Number(message.attempt_count),
          ...(message.last_error ? { lastError: String(message.last_error) } : {}),
          createdAt: new Date(String(message.created_at)),
          ...(message.lease_expires_at
            ? { leaseExpiresAt: new Date(String(message.lease_expires_at)) }
            : {}),
        });
        await adapter.enqueue(String(message.topic), {
          name: String(message.message_type),
          data: envelope,
          options: { jobId: `replay-${messageId}`, attempts: 1 },
        });
      },
      exerciseDeadLetter: async () => {
        const poisonJobId = `poison-${randomUUID()}`;
        await adapter.enqueue("render", {
          name: "disabled.command",
          data: { source: "phase-2a2-e2e" },
          options: { attempts: 1, jobId: poisonJobId },
        });
        let deadLettered = false;
        await waitFor(async () => {
          const jobs = await adapter
            .getQueue("dead-letter")
            .getJobs(["waiting", "active", "completed"]);
          deadLettered = jobs.some((job) => {
            const payload = job.data as { sourceJobId?: string };
            return payload.sourceJobId === poisonJobId;
          });
          if (!deadLettered) throw new Error("dead-letter message not observed");
        }, 5_000);
        return deadLettered;
      },
      close: async () => {
        await api?.close();
        api = null;
        await scheduler?.stop();
        scheduler = null;
        await workerBootstrap?.stop();
        workerBootstrap = null;
        await workerComposition?.close();
        workerComposition = null;
        await mockOpenAI.close();
        await database?.end({ timeout: 5 });
        database = null;
      },
    };
  } catch (error) {
    await api?.close();
    await scheduler?.stop();
    await workerBootstrap?.stop();
    await workerComposition?.close();
    await mockOpenAI.close();
    await database?.end({ timeout: 5 });
    throw error;
  }
}
