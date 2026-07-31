import { createWorkerBootstrap } from "./bootstrap.js";
import { createRuntimeHandlerRegistry } from "./runtime-registry.js";

const runtime = createRuntimeHandlerRegistry({});
const bootstrap = createWorkerBootstrap({
  handlers: runtime.registrations,
  requiredHandlerTypes: runtime.missingJobTypes,
});
const health = await bootstrap.start();
if (health.status !== "ready") {
  console.error(`Worker runtime not ready: ${health.missingHandlerTypes.join(", ") || "no handlers"}`);
  process.exitCode = 1;
}

const shutdown = async () => {
  await bootstrap.stop();
  process.exitCode = 0;
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
