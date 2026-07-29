import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { authRoutes } from "./routes/auth/index.js";
import { registerHealthRoute } from "./routes/system/health.js";
import { workspaceRoutes } from "./routes/workspace/index.js";
import { clientBrandRoutes } from "./routes/client-brand/index.js";
import { mediaCatalogRoutes } from "./routes/media-catalog/index.js";
import { assetFileRoutes, assetRoutesGroup } from "./routes/asset/index.js";
import { campaignRouteGroup } from "./routes/campaign/index.js";
import { creativeRouteGroup } from "./routes/creative/index.js";
import { validationRouteGroup } from "./routes/validation/index.js";
import { approvalRouteGroup } from "./routes/approval/index.js";
import { exportRouteGroup } from "./routes/export/index.js";

export async function buildApp(options: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    rewriteUrl: (request) => (request.url ?? "/").replace(/:([a-z][a-z-]*)(?=\/|$)/g, ".$1"),
    ...options,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  await registerHealthRoute(app);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(clientBrandRoutes);
  await app.register(mediaCatalogRoutes);
  await app.register(assetFileRoutes);
  await app.register(assetRoutesGroup);
  await app.register(campaignRouteGroup);
  await app.register(creativeRouteGroup);
  await app.register(validationRouteGroup);
  await app.register(approvalRouteGroup);
  await app.register(exportRouteGroup);
  return app;
}
