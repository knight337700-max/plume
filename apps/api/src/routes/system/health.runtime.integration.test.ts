import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3ObjectStorage } from "../../../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { registerHealthRoute } from "./health.js";

const stagingEnvironment = {
  NODE_ENV: "production",
  APP_ENV: "staging",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://plume:plume_local_only@localhost:5432/plume",
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://plume:plume_local_only@localhost:5432/plume_test",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "plume",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "plume_local_only",
  S3_BUCKET: `plume-health-${randomUUID().replaceAll("-", "").slice(0, 20)}`,
  QUEUE_PREFIX: "plume-staging-local-e2e",
  OPENAI_PROVIDER_MODE: "mock",
  CORS_ALLOWED_ORIGINS: "http://localhost:5173",
};

describe("runtime readiness against local staging-like dependencies", () => {
  it("returns 200 only after PostgreSQL, Redis, S3 and BullMQ are reachable", async () => {
    const keys = Object.keys(stagingEnvironment) as (keyof typeof stagingEnvironment)[];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const storage = new S3ObjectStorage({
      endpoint: stagingEnvironment.S3_ENDPOINT,
      bucket: stagingEnvironment.S3_BUCKET,
      accessKeyId: stagingEnvironment.S3_ACCESS_KEY_ID,
      secretAccessKey: stagingEnvironment.S3_SECRET_ACCESS_KEY,
    });
    const stored = await storage.put({
      objectKey: "uploads/health-probe",
      body: new Uint8Array([1]),
      contentType: "application/octet-stream",
    });
    const app = Fastify();
    try {
      for (const key of keys) process.env[key] = stagingEnvironment[key];
      await registerHealthRoute(app);
      const live = await app.inject({ method: "GET", url: "/api/v1/health/live" });
      const ready = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
      expect(live.statusCode).toBe(200);
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({
        status: "ok",
        checks: { config: "ok", postgres: "ok", redis: "ok", storage: "ok", queue: "ok" },
      });
    } finally {
      await app.close();
      await storage.deleteTemp(stored.objectKey);
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 15_000);
});
