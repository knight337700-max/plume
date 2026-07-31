import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_QUEUE_ROUTES, QUEUE_NAMES } from "../../packages/core/src/async/queue-routing.ts";

const repositoryRoot = join(import.meta.dirname, "..", "..");
const read = (relativePath: string): string =>
  readFileSync(join(repositoryRoot, relativePath), "utf8");
const requireText = (source: string, text: string, label: string): void => {
  if (!source.includes(text)) throw new Error(`${label} is missing ${text}`);
};

const queueRoutes = Object.values(COMMAND_QUEUE_ROUTES);
if (queueRoutes.some((queue) => !QUEUE_NAMES.includes(queue))) {
  throw new Error("a produced command points to an unregistered queue");
}

const queueSource = read("packages/infrastructure/src/queue/bullmq.ts");
requireText(queueSource, "process.env.QUEUE_PREFIX", "queue prefix contract");
if (queueSource.includes("process.env.NODE_ENV"))
  throw new Error("queue prefix must not derive from NODE_ENV");

const runtimeSource = read("apps/worker/src/runtime-registry.ts");
requireText(runtimeSource, "COMMAND_QUEUE_ROUTES", "worker runtime route registry");
requireText(runtimeSource, '"dead-letter"', "dead-letter runtime route");
requireText(runtimeSource, "PermanentJobError", "unknown job permanent failure");

const idempotencySource = read("apps/worker/src/middleware/idempotency.ts");
requireText(idempotencySource, "tryStart", "consumer idempotency claim");
requireText(idempotencySource, "release", "consumer retry release");
requireText(idempotencySource, "summarizeOutcome", "consumer safe outcome storage");

const leaseSource = read("apps/scheduler/src/lease.ts");
for (const text of ["PX", "NX", "pexpire", "ARGV[1]", "scheduler:lease"]) {
  requireText(leaseSource, text, "distributed scheduler lease");
}

const providerSource = read("packages/infrastructure/src/ai/provider-runtime.ts");
for (const text of ["mock", "live", "OPENAI_API_KEY", "OPENAI_DEFAULT_MODEL"]) {
  requireText(providerSource, text, "OpenAI provider runtime toggle");
}
if (providerSource.includes("fallback"))
  throw new Error("OpenAI provider runtime must not silently fallback");

const migrationSource = read("packages/db/src/migration-runner.ts");
for (const text of ["MIGRATION_BACKUP_CONFIRMED", "pg_advisory_lock", "destructive"]) {
  requireText(migrationSource, text, "staging migration safety");
}

const healthSource = read("apps/api/src/routes/system/health.ts");
for (const text of ["/api/v1/health/live", "/api/v1/health/ready", "SELECT 1", "ping", "checkBucket", "503"]) {
  requireText(healthSource, text, "dependency-aware readiness");
}

const manifest = read("infra/deploy/staging/services.yaml");
for (const text of [
  "NODE_ENV: production",
  "APP_ENV: staging",
  "QUEUE_PREFIX: plume-staging",
  "OPENAI_PROVIDER_MODE: mock",
  "pnpm db:migrate:staging",
  "@sha256:",
  "/api/v1/health/live",
  "/api/v1/health/ready",
]) {
  requireText(manifest, text, "staging manifest");
}
if (/tag:\s*["']?latest\b/iu.test(manifest) || manifest.includes("<registry>"))
  throw new Error("staging manifest contains a mutable or unresolved image reference");

console.log(
  `Staging runtime PASS: ${Object.keys(COMMAND_QUEUE_ROUTES).length} produced commands, ${QUEUE_NAMES.length} queue topics, digest-pinned mock manifest`,
);
