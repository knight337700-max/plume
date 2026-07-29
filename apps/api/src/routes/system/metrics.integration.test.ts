import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { MetricRegistry } from "../../../../../packages/observability/src/index.js";
import { registerMetricsRoute } from "./metrics.js";

describe("metrics endpoint", () => {
  it("returns Prometheus text without workspace labels", async () => {
    const app = Fastify();
    const registry = new MetricRegistry();
    registry.increment("http_requests_total", 1, { method: "GET", route: "/health", status: "200" });
    await registerMetricsRoute(app, registry);

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("http_requests_total");
    expect(response.body).not.toContain("workspaceId");
    await app.close();
  });
});
