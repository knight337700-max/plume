import {
  extractTraceContext,
  injectTraceContext,
  startSpan,
  type TraceExporter,
  type TraceSpanHandle,
} from "../../../packages/observability/src/index.js";

export interface TraceableJob {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

export function traceHeaders(span: TraceSpanHandle): Readonly<Record<string, string>> {
  return injectTraceContext(span.context);
}

export function startWorkerJobSpan(
  job: TraceableJob,
  operation: string,
  exporter?: TraceExporter,
): TraceSpanHandle {
  const parentContext = job.headers ? extractTraceContext(job.headers) : undefined;
  return startSpan(operation, {
    ...(parentContext === undefined ? {} : { parentContext }),
    ...(exporter === undefined ? {} : { exporter }),
  });
}
