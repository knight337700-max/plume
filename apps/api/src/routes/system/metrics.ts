import type { FastifyInstance } from "fastify";
import {
  defaultMetricsRegistry,
  type MetricRegistry,
} from "../../../../../packages/observability/src/index.js";

export async function registerMetricsRoute(app: FastifyInstance, registry: MetricRegistry = defaultMetricsRegistry): Promise<void> {
  app.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4; charset=utf-8").send(registry.renderPrometheus()));
}
