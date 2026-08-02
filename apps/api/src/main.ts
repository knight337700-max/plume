import { pathToFileURL } from "node:url";
import { buildApp } from "./app.js";
import { createDatabaseClient } from "../../../packages/db/src/client.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { DurableJobQueryRepository } from "../../../packages/infrastructure/src/db/durable-job-query-repository.js";
import { createJobUseCases } from "../../../packages/core/src/modules/operations/job-use-cases.js";
import { loadEnvironment } from "../../../packages/config/src/index.js";
import { DrizzleIamRepositories } from "../../../packages/infrastructure/src/db/iam-drizzle-repositories.js";
import {
  PostgresSessionStore,
  PostgresUploadSessionRepository,
} from "../../../packages/infrastructure/src/db/upload-session-repository.js";
import { S3ObjectStorage } from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createUploadVerifier } from "../../../packages/infrastructure/src/files/verify-upload.js";
import { createUploadUseCases } from "../../../packages/core/src/modules/asset/upload-use-cases.js";
import { createSessionUseCases } from "../../../packages/core/src/modules/iam/session-use-cases.js";

export async function startApi(): Promise<void> {
  const environment = loadEnvironment(process.env);
  const database = createDatabaseClient();
  const iam = new DrizzleIamRepositories(database.sql);
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
  const storage = new S3ObjectStorage({
    endpoint: environment.s3Endpoint,
    bucket: environment.s3Bucket,
    accessKeyId: environment.s3AccessKeyId,
    secretAccessKey: environment.s3SecretAccessKey,
  });
  const uploads = createUploadUseCases({
    repository: new PostgresUploadSessionRepository(database.sql),
    storage,
    verifier: createUploadVerifier(
      { read: (objectKey) => storage.get(objectKey) },
      { maxBytes: environment.uploadMaxBytes, maxPixels: environment.uploadMaxPixels },
    ),
    bucket: environment.s3Bucket,
    expirySeconds: environment.uploadSignedUrlTtlSeconds,
    filePolicy: {
      allowedMimeTypes: environment.uploadAllowedMimeTypes,
      maxBytes: environment.uploadMaxBytes,
      maxPixels: environment.uploadMaxPixels,
    },
  });
  const sessions = createSessionUseCases(new PostgresSessionStore(database.sql), iam);
  const app = await buildApp({
    securityMode: environment.nodeEnv === "production" ? "production" : "test",
    sessions,
    memberships,
    uploads,
    ...(process.env.SESSION_SECRET ? { sessionSecret: process.env.SESSION_SECRET } : {}),
    cookieSecure: environment.cookieSecure,
    cookieSameSite: environment.cookieSameSite,
    bodyLimit: environment.requestBodyLimitBytes,
    rateLimit: {
      windowMs: environment.rateLimitWindowMs,
      maxRequests: environment.rateLimitMaxRequests,
    },
    publicMetrics: false,
    asyncCommandPublisher: new DurableAsyncCommandPublisher(database.sql),
    jobs: createJobUseCases(new DurableJobQueryRepository(database.sql)),
  });
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ host, port });
  const shutdown = async () => {
    await app.close();
    await database.sql.end({ timeout: 5 });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApi();
}
