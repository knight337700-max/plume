import { randomBytes } from "node:crypto";
import { redactLogContext } from "./redaction.js";

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

export type TraceAttribute = string | number | boolean;
export type SpanStatus = "UNSET" | "OK" | "ERROR";

export interface TraceSpan {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, TraceAttribute>>;
  readonly events: readonly TraceEvent[];
}

export interface TraceEvent {
  readonly name: string;
  readonly at: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface TraceExporter {
  export(span: TraceSpan): void;
}

export class InMemoryTraceExporter implements TraceExporter {
  private readonly records: TraceSpan[] = [];

  export(span: TraceSpan): void {
    this.records.push(span);
  }

  get spans(): readonly TraceSpan[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }
}

export interface TraceSpanHandle {
  readonly context: TraceContext;
  readonly setAttribute: (name: string, value: TraceAttribute) => void;
  readonly addEvent: (name: string, attributes?: Readonly<Record<string, unknown>>) => void;
  readonly end: (status?: Exclude<SpanStatus, "UNSET">) => TraceSpan;
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function createRootTraceContext(): TraceContext {
  return { traceId: randomHex(16), spanId: randomHex(8) };
}

export function createChildTraceContext(parent: TraceContext): TraceContext {
  return { traceId: parent.traceId, spanId: randomHex(8), parentSpanId: parent.spanId };
}

export function formatTraceParent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-01`;
}

type HeaderValue = string | string[] | undefined;

export function injectTraceContext(context: TraceContext): Readonly<Record<string, string>> {
  return { traceparent: formatTraceParent(context), "x-trace-id": context.traceId };
}

export function extractTraceContext(headers: Readonly<Record<string, HeaderValue>>): TraceContext | undefined {
  const traceparent = Object.entries(headers).find(([key]) => key.toLowerCase() === "traceparent")?.[1];
  const value = Array.isArray(traceparent) ? traceparent[0] : traceparent;
  const match = value?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (match?.[1] && match[2]) return { traceId: match[1].toLowerCase(), spanId: match[2].toLowerCase() };
  return undefined;
}

function safeAttribute(name: string, value: TraceAttribute): TraceAttribute {
  const redacted = redactLogContext({ [name]: value })[name];
  return typeof redacted === "string" || typeof redacted === "number" || typeof redacted === "boolean"
    ? redacted
    : "[REDACTED]";
}

export function startSpan(
  name: string,
  input: {
    readonly parentContext?: TraceContext;
    readonly exporter?: TraceExporter;
    readonly attributes?: Readonly<Record<string, TraceAttribute>>;
  } = {},
): TraceSpanHandle {
  const context = input.parentContext ? createChildTraceContext(input.parentContext) : createRootTraceContext();
  const startedAt = new Date().toISOString();
  const attributes: Record<string, TraceAttribute> = {};
  const events: TraceEvent[] = [];
  for (const [key, value] of Object.entries(input.attributes ?? {})) attributes[key] = safeAttribute(key, value);
  let status: SpanStatus = "UNSET";
  let endedAt: string | undefined;
  let ended: TraceSpan | undefined;

  const snapshot = (): TraceSpan => ({
    name,
    traceId: context.traceId,
    spanId: context.spanId,
    ...(context.parentSpanId === undefined ? {} : { parentSpanId: context.parentSpanId }),
    startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
    status,
    attributes: { ...attributes },
    events: events.map((event) => ({ ...event, attributes: { ...event.attributes } })),
  });

  return {
    context,
    setAttribute(attributeName, value) {
      if (ended) return;
      attributes[attributeName] = safeAttribute(attributeName, value);
    },
    addEvent(eventName, eventAttributes = {}) {
      if (ended) return;
      events.push({ name: eventName, at: new Date().toISOString(), attributes: redactLogContext(eventAttributes) });
    },
    end(nextStatus = "OK") {
      if (ended) return ended;
      status = nextStatus;
      endedAt = new Date().toISOString();
      ended = snapshot();
      input.exporter?.export(ended);
      return ended;
    },
  };
}
