import { describe, expect, it } from "vitest";
import { MetricRegistry } from "./metrics.js";

describe("low-cardinality metrics", () => {
  it("records only the expected operational series", () => {
    const registry = new MetricRegistry();
    registry.increment("http_requests_total", 2, { method: "GET", route: "/health", status: "200" });
    registry.set("queue_lag_seconds", 1.5, { queue: "render" });
    registry.increment("job_status_total", 1, { job_type: "export", status: "SUCCEEDED" });
    registry.observe("ai_request_duration_seconds", 0.25, { provider: "openai", operation: "generate" });
    registry.observe("render_duration_seconds", 0.5, { format: "1200x628", purpose: "preview", status: "SUCCEEDED" });

    const output = registry.renderPrometheus();
    expect(output).toContain('http_requests_total{method="GET",route="/health",status="200"} 2');
    expect(output).toContain('queue_lag_seconds{queue="render"} 1.5');
    expect(output).toContain("ai_request_duration_seconds_count");
    expect(output).toContain("render_duration_seconds_sum");
    expect(output).not.toContain("workspace");
  });

  it("rejects high-cardinality identifiers as labels", () => {
    const registry = new MetricRegistry();
    expect(() => registry.increment("http_requests_total", 1, { method: "GET", route: "/health", status: "200", workspaceId: "ws-1" })).toThrow("low-cardinality");
    expect(() => registry.set("queue_lag_seconds", 1, { workspaceId: "ws-1" })).toThrow("low-cardinality");
  });
});
