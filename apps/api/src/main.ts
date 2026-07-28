import { pathToFileURL } from "node:url";
import { buildApp } from "./app.js";

export async function startApi(): Promise<void> {
  const app = await buildApp();
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ host, port });
  const shutdown = async () => {
    await app.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApi();
}
