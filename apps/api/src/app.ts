import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { authRoutes } from "./routes/auth/index.js";
import { registerHealthRoute, type ReadinessChecks } from "./routes/system/health.js";
import { workspaceRoutes } from "./routes/workspace/index.js";
import { clientBrandRoutes } from "./routes/client-brand/index.js";
import { mediaCatalogRoutes } from "./routes/media-catalog/index.js";
import { assetFileRoutes, assetRoutesGroup } from "./routes/asset/index.js";
import { campaignRouteGroup } from "./routes/campaign/index.js";
import { creativeRouteGroup } from "./routes/creative/index.js";
import { validationRouteGroup } from "./routes/validation/index.js";
import { approvalRouteGroup } from "./routes/approval/index.js";
import { exportRouteGroup } from "./routes/export/index.js";
import { operationsRouteGroup } from "./routes/operations/index.js";
import { installTracingHooks } from "./plugins/tracing.js";
import { registerMetricsRoute } from "./routes/system/metrics.js";
import { registerDashboardRoute } from "./routes/system/dashboard.js";

export interface BuildAppOptions extends FastifyServerOptions {
  readonly readinessChecks?: ReadinessChecks;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { readinessChecks, ...fastifyOptions } = options;
  const app = Fastify({
    logger: false,
    rewriteUrl: (request) => (request.url ?? "/").replace(/:([a-z][a-z-]*)(?=\/|$)/g, ".$1"),
    ...fastifyOptions,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  await installTracingHooks(app);
  await registerHealthRoute(app, readinessChecks ? { readinessChecks } : {});
  await registerMetricsRoute(app);
  await registerDashboardRoute(app);
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
  await app.register(operationsRouteGroup);
  return app;
}
