import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { authRoutes } from "./routes/auth/index.js";
import { registerHealthRoute } from "./routes/system/health.js";
import { workspaceRoutes } from "./routes/workspace/index.js";

export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ...options });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  await registerHealthRoute(app);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  return app;
}
