import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  extractTraceContext,
  startSpan,
  type TraceContext,
  type TraceExporter,
  type TraceSpanHandle,
} from "../../../../packages/observability/src/index.js";

declare module "fastify" {
  interface FastifyRequest {
    traceContext?: TraceContext;
    traceSpan?: TraceSpanHandle;
  }
}

export interface TracingPluginOptions {
  readonly exporter?: TraceExporter;
}

export async function installTracingHooks(app: FastifyInstance, options: TracingPluginOptions = {}): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    const parentContext = extractTraceContext(request.headers);
    const span = startSpan(`http.${request.method.toLowerCase()}`, {
      ...(parentContext === undefined ? {} : { parentContext }),
      ...(options.exporter === undefined ? {} : { exporter: options.exporter }),
      attributes: { "http.method": request.method, "http.route": request.routeOptions.url ?? "unknown" },
    });
    request.traceContext = span.context;
    request.traceSpan = span;
    reply.header("x-trace-id", span.context.traceId);
    reply.header("x-span-id", span.context.spanId);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.traceSpan?.end(reply.statusCode >= 400 ? "ERROR" : "OK");
  });
}

export function createTracingPlugin(options: TracingPluginOptions = {}): FastifyPluginAsync {
  return async (app: FastifyInstance) => installTracingHooks(app, options);
}

export const tracingPlugin: FastifyPluginAsync = createTracingPlugin();
