import { describe, expect, it } from "vitest";
import {
  InMemoryTraceExporter,
  createRootTraceContext,
  extractTraceContext,
  injectTraceContext,
  startSpan,
} from "./tracing.js";

describe("trace continuity", () => {
  it("continues the same trace across a queue boundary", () => {
    const exporter = new InMemoryTraceExporter();
    const apiSpan = startSpan("api.request", { exporter, parentContext: createRootTraceContext() });
    const queuedHeaders = injectTraceContext(apiSpan.context);
    const workerSpan = startSpan("worker.job", { exporter, parentContext: extractTraceContext(queuedHeaders) });

    expect(workerSpan.context.traceId).toBe(apiSpan.context.traceId);
    expect(workerSpan.context.parentSpanId).toBe(apiSpan.context.spanId);
    apiSpan.end();
    const workerRecord = workerSpan.end();
    expect(exporter.spans).toContain(workerRecord);
  });

  it("keeps provider request IDs while redacting prompt metadata", () => {
    const exporter = new InMemoryTraceExporter();
    const span = startSpan("ai.request", { exporter, attributes: { "provider.request_id": "provider-1" } });
    span.setAttribute("promptBody", "do not export");
    const record = span.end();
    expect(record.attributes["provider.request_id"]).toBe("provider-1");
    expect(record.attributes.promptBody).toBe("[REDACTED]");
    expect(JSON.stringify(record)).not.toContain("do not export");
  });
});
