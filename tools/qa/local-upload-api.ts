import { applyStagingMigrations } from "../../packages/db/src/migration-runner.ts";
import { createSqlClient } from "../../packages/db/src/client.ts";
import { buildApp } from "../../apps/api/src/app.ts";
import { DurableAsyncCommandPublisher } from "../../packages/infrastructure/src/async/durable-command-publisher.ts";
import { DurableJobQueryRepository } from "../../packages/infrastructure/src/db/durable-job-query-repository.ts";
import { DrizzleIamRepositories } from "../../packages/infrastructure/src/db/iam-drizzle-repositories.ts";
import {
  PostgresSessionStore,
  PostgresUploadSessionRepository,
} from "../../packages/infrastructure/src/db/upload-session-repository.ts";
import { createJobUseCases } from "../../packages/core/src/modules/operations/job-use-cases.ts";
import { createUploadUseCases } from "../../packages/core/src/modules/asset/upload-use-cases.ts";
import { createSessionUseCases } from "../../packages/core/src/modules/iam/session-use-cases.ts";
import { createUploadVerifier } from "../../packages/infrastructure/src/files/verify-upload.ts";
import { S3ObjectStorage } from "../../packages/infrastructure/src/storage/s3-object-storage.ts";

const localEnvironment: Record<string, string> = {
  NODE_ENV: "development",
  APP_ENV: "development",
  DATABASE_URL: "postgresql://plume:plume_local_only@127.0.0.1:55440/plume",
  TEST_DATABASE_URL: "postgresql://plume:plume_local_only@127.0.0.1:55440/plume",
  REDIS_URL: "redis://127.0.0.1:56384",
  S3_ENDPOINT: "http://127.0.0.1:59022",
  S3_ACCESS_KEY_ID: "plume",
  S3_SECRET_ACCESS_KEY: "plume_local_only",
  S3_BUCKET: "plume-local-qa-2-6a",
  QUEUE_PREFIX: "plume-local-qa-2-6a",
  OPENAI_PROVIDER_MODE: "mock",
  OPENAI_MODEL: "gpt-5.6-luna",
  COOKIE_SECURE: "false",
  COOKIE_SAME_SITE: "lax",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
  SESSION_SECRET: "plume-local-qa-session-secret-2-6a-only",
  REQUEST_BODY_LIMIT_BYTES: "2097152",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_MAX_REQUESTS: "120",
  UPLOAD_MAX_BYTES: "20971520",
  UPLOAD_MAX_PIXELS: "40000000",
  UPLOAD_ALLOWED_MIME_TYPES: "image/png,image/jpeg,text/plain",
  UPLOAD_SIGNED_URL_TTL_SECONDS: "300",
};

for (const [key, value] of Object.entries(localEnvironment)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const migrationAppEnv = process.env.APP_ENV;
const migrationBackup = process.env.MIGRATION_BACKUP_CONFIRMED;
process.env.APP_ENV = "staging";
process.env.MIGRATION_BACKUP_CONFIRMED = "true";
await applyStagingMigrations(process.env);
if (migrationAppEnv === undefined) delete process.env.APP_ENV;
else process.env.APP_ENV = migrationAppEnv;
if (migrationBackup === undefined) delete process.env.MIGRATION_BACKUP_CONFIRMED;
else process.env.MIGRATION_BACKUP_CONFIRMED = migrationBackup;

const storage = new S3ObjectStorage({
  endpoint: process.env.S3_ENDPOINT!,
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.S3_ACCESS_KEY_ID!,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
});
await storage.put({
  objectKey: "qa-bootstrap/phase-2-6a",
  contentType: "text/plain",
  body: new TextEncoder().encode("local-qa-bucket-ready"),
});

const sql = createSqlClient();
await sql`
  INSERT INTO workspace (id, name, slug, status)
  VALUES (
    '00000000-0000-4000-8000-0000000006a0',
    'JACOMO Synthetic QA',
    'plume-local-qa-2-6a',
    'ACTIVE'
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, slug = EXCLUDED.slug, status = EXCLUDED.status, deleted_at = NULL
`;
const iam = new DrizzleIamRepositories(sql);
const memberships = {
  find: async (workspaceId: string, userId: string) => {
    const membership = await iam.getMembership(workspaceId, userId);
    if (!membership) return null;
    return {
      workspaceId: membership.workspaceId,
      userId: membership.userId,
      role: membership.roleCode,
      status:
        membership.status === "ACTIVE"
          ? ("ACTIVE" as const)
          : membership.status === "SUSPENDED"
            ? ("SUSPENDED" as const)
            : ("INVITED" as const),
    };
  },
};
const uploads = createUploadUseCases({
  repository: new PostgresUploadSessionRepository(sql),
  storage,
  verifier: createUploadVerifier(
    { read: (objectKey) => storage.get(objectKey) },
    {
      maxBytes: Number(process.env.UPLOAD_MAX_BYTES),
      maxPixels: Number(process.env.UPLOAD_MAX_PIXELS),
    },
  ),
  bucket: process.env.S3_BUCKET!,
  expirySeconds: Number(process.env.UPLOAD_SIGNED_URL_TTL_SECONDS),
  filePolicy: {
    allowedMimeTypes: process.env.UPLOAD_ALLOWED_MIME_TYPES!.split(","),
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES),
    maxPixels: Number(process.env.UPLOAD_MAX_PIXELS),
  },
});
const app = await buildApp({
  securityMode: "test",
  sessions: createSessionUseCases(new PostgresSessionStore(sql), iam),
  memberships,
  uploads,
  sessionSecret: process.env.SESSION_SECRET,
  cookieSecure: false,
  cookieSameSite: "lax",
  bodyLimit: Number(process.env.REQUEST_BODY_LIMIT_BYTES),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS),
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS),
  },
  publicMetrics: false,
  asyncCommandPublisher: new DurableAsyncCommandPublisher(sql),
  jobs: createJobUseCases(new DurableJobQueryRepository(sql)),
});
await app.listen({ host: "127.0.0.1", port: 3000 });
const shutdown = async () => {
  await app.close();
  await sql.end({ timeout: 5 });
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
