import { pathToFileURL } from "node:url";
import { buildApp } from "./app.js";
import { createDatabaseClient } from "../../../packages/db/src/client.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { DurableJobQueryRepository } from "../../../packages/infrastructure/src/db/durable-job-query-repository.js";
import { createJobUseCases } from "../../../packages/core/src/modules/operations/job-use-cases.js";

export async function startApi(): Promise<void> {
  const database = createDatabaseClient();
  const app = await buildApp({
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
