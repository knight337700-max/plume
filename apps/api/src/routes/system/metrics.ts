import type { FastifyInstance } from "fastify";
import {
  defaultMetricsRegistry,
  type MetricRegistry,
} from "../../../../../packages/observability/src/index.js";

export interface MetricsRouteOptions {
  readonly publicAccess?: boolean;
}

export async function registerMetricsRoute(
  app: FastifyInstance,
  registry: MetricRegistry = defaultMetricsRegistry,
  options: MetricsRouteOptions = {},
): Promise<void> {
  app.get("/metrics", async (_request, reply) => {
    if (options.publicAccess === false) return reply.code(404).send({ code: "NOT_FOUND" });
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(registry.renderPrometheus());
  });
}
