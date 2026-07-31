import { createWorkerBootstrap } from "./bootstrap.js";
import { createRuntimeHandlerRegistry } from "./runtime-registry.js";
import { createWorkerRuntimeComposition } from "./composition.js";

const composition = createWorkerRuntimeComposition();
const runtime = createRuntimeHandlerRegistry(
  composition.handlers,
  composition.enabledJobTypes,
  composition.enabledJobTypes,
);
const bootstrap = createWorkerBootstrap({
  adapter: composition.adapter,
  handlers: runtime.registrations,
  requiredHandlerTypes: composition.enabledJobTypes,
  readinessChecks: composition.readinessChecks,
});
const health = await bootstrap.start();
if (health.status !== "ready") {
  console.error(`Worker runtime not ready: ${health.missingHandlerTypes.join(", ") || "no handlers"}; checks=${health.failedChecks.join(", ") || "none"}`);
  await bootstrap.stop();
  await composition.close();
  process.exitCode = 1;
} else {
  await composition.outboxDispatcher.start();
}

const shutdown = async () => {
  await bootstrap.stop();
  await composition.close();
  process.exitCode = 0;
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
