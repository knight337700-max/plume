import postgres from "postgres";
import Redis from "ioredis";
import { Queue, type ConnectionOptions } from "bullmq";
import { loadEnvironment } from "../../../../../packages/config/src/env.js";
import { S3ObjectStorage } from "../../../../../packages/infrastructure/src/storage/s3-object-storage.js";
import type { FastifyInstance } from "fastify";

const version = () => process.env.APP_VERSION ?? "0.1.0";

export type ReadinessCheck = () => Promise<void> | void;

export interface ReadinessChecks {
  readonly config: ReadinessCheck;
  readonly postgres: ReadinessCheck;
  readonly redis: ReadinessCheck;
  readonly storage: ReadinessCheck;
  readonly queue: ReadinessCheck;
}

export interface HealthRouteOptions {
  readonly readinessChecks?: ReadinessChecks;
}

interface ReadinessResponse {
  readonly status: "ok" | "degraded";
  readonly version: string;
  readonly time: string;
  readonly checks: Readonly<Record<keyof ReadinessChecks, "ok" | "failed">>;
}

function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.replace(/^\//u, "");
  return {
    host: parsed.hostname || "localhost",
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(database ? { db: Number(database) } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

function requireValue(environment: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is missing`);
  return value;
}

async function checkPostgres(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function checkRedis(redisUrl: string): Promise<void> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    enableOfflineQueue: false,
  });
  try {
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

async function checkQueue(redisUrl: string, queuePrefix: string): Promise<void> {
  const queue = new Queue(`${queuePrefix}:readiness`, {
    connection: redisConnectionOptions(redisUrl),
  });
  try {
    await queue.waitUntilReady();
  } finally {
    await queue.close();
  }
}

export function createDefaultReadinessChecks(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReadinessChecks {
  return {
    config: () => {
      loadEnvironment(environment);
    },
    postgres: () => checkPostgres(requireValue(environment, "DATABASE_URL")),
    redis: () => checkRedis(requireValue(environment, "REDIS_URL")),
    storage: async () => {
      const storage = new S3ObjectStorage({
        endpoint: requireValue(environment, "S3_ENDPOINT"),
        bucket: requireValue(environment, "S3_BUCKET"),
        accessKeyId: requireValue(environment, "S3_ACCESS_KEY_ID"),
        secretAccessKey: requireValue(environment, "S3_SECRET_ACCESS_KEY"),
      });
      await storage.checkBucket();
    },
    queue: () =>
      checkQueue(
        requireValue(environment, "REDIS_URL"),
        environment.QUEUE_PREFIX?.trim() || "development",
      ),
  };
}

function baseHealthResponse(): { status: "ok"; version: string; time: string } {
  return { status: "ok", version: version(), time: new Date().toISOString() };
}

export async function registerHealthRoute(
  app: FastifyInstance,
  options: HealthRouteOptions = {},
): Promise<void> {
  const readinessChecks = options.readinessChecks ?? createDefaultReadinessChecks();
  const healthSchema = {
    type: "object",
    additionalProperties: false,
    required: ["status", "version", "time"],
    properties: {
      status: { type: "string", enum: ["ok", "degraded"] },
      version: { type: "string" },
      time: { type: "string", format: "date-time" },
    },
  } as const;

  app.get(
    "/api/v1/health",
    {
      config: { operationId: "getHealth" },
      schema: { response: { 200: healthSchema } },
    },
    async (request, reply) => {
      reply.header("x-request-id", request.id);
      reply.header("etag", `W/\"health-${version()}\"`);
      return baseHealthResponse();
    },
  );

  app.get(
    "/api/v1/health/live",
    {
      config: { operationId: "getHealthLive" },
      schema: { response: { 200: healthSchema } },
    },
    async (request, reply) => {
      reply.header("x-request-id", request.id);
      return baseHealthResponse();
    },
  );

  app.get(
    "/api/v1/health/ready",
    {
      config: { operationId: "getHealthReady" },
      schema: {
        response: {
          200: {
            ...healthSchema,
            required: [...healthSchema.required, "checks"],
            properties: {
              ...healthSchema.properties,
              checks: {
                type: "object",
                additionalProperties: false,
                required: ["config", "postgres", "redis", "storage", "queue"],
                properties: {
                  config: { type: "string", enum: ["ok", "failed"] },
                  postgres: { type: "string", enum: ["ok", "failed"] },
                  redis: { type: "string", enum: ["ok", "failed"] },
                  storage: { type: "string", enum: ["ok", "failed"] },
                  queue: { type: "string", enum: ["ok", "failed"] },
                },
              },
            },
          },
          503: {
            ...healthSchema,
            required: [...healthSchema.required, "checks"],
            properties: {
              ...healthSchema.properties,
              checks: {
                type: "object",
                additionalProperties: false,
                required: ["config", "postgres", "redis", "storage", "queue"],
                properties: {
                  config: { type: "string", enum: ["ok", "failed"] },
                  postgres: { type: "string", enum: ["ok", "failed"] },
                  redis: { type: "string", enum: ["ok", "failed"] },
                  storage: { type: "string", enum: ["ok", "failed"] },
                  queue: { type: "string", enum: ["ok", "failed"] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const entries = Object.entries(readinessChecks) as [keyof ReadinessChecks, ReadinessCheck][];
      const results = await Promise.all(
        entries.map(async ([name, check]) => {
          try {
            await check();
            return [name, "ok"] as const;
          } catch {
            return [name, "failed"] as const;
          }
        }),
      );
      const checks = Object.fromEntries(results) as ReadinessResponse["checks"];
      const ready = results.every(([, status]) => status === "ok");
      const response: ReadinessResponse = {
        ...baseHealthResponse(),
        status: ready ? "ok" : "degraded",
        checks,
      };
      reply.header("x-request-id", request.id);
      if (!ready) reply.code(503);
      return response;
    },
  );
}
