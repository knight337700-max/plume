import { createWorkerBootstrap } from "./bootstrap.js";

const bootstrap = createWorkerBootstrap();
await bootstrap.start();

const shutdown = async () => {
  await bootstrap.stop();
  process.exitCode = 0;
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
