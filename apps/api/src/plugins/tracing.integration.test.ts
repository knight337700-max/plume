import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  InMemoryTraceExporter,
  createRootTraceContext,
  formatTraceParent,
} from "../../../../packages/observability/src/index.js";
import { installTracingHooks } from "./tracing.js";

describe("API tracing plugin", () => {
  it("continues an inbound trace and exposes correlation headers", async () => {
    const exporter = new InMemoryTraceExporter();
    const app = Fastify();
    await installTracingHooks(app, { exporter });
    app.get("/ping", async () => ({ ok: true }));

    const parent = createRootTraceContext();
    const response = await app.inject({ method: "GET", url: "/ping", headers: { traceparent: formatTraceParent(parent) } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-trace-id"]).toBe(parent.traceId);
    expect(response.headers["x-span-id"]).not.toBe(parent.spanId);
    expect(exporter.spans[0]?.traceId).toBe(parent.traceId);
    await app.close();
  });
});
