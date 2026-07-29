import { redactLogContext } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogSink { write(line: string): void }
export interface StructuredLogger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void;
  info(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(message: string, context?: Readonly<Record<string, unknown>>): void;
  error(message: string, context?: Readonly<Record<string, unknown>>): void;
  child(context: Readonly<Record<string, unknown>>): StructuredLogger;
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, child) => typeof child === "bigint" ? child.toString() : child);
}

export function createLogger(input: { readonly service: string; readonly sink?: LogSink; readonly context?: Readonly<Record<string, unknown>> }): StructuredLogger {
  const sink = input.sink ?? { write(line: string) { process.stdout.write(`${line}\n`); } };
  const context = { service: input.service, ...(input.context ?? {}) };
  const write = (level: LogLevel, message: string, fields?: Readonly<Record<string, unknown>>) => {
    const record = redactLogContext({ timestamp: new Date().toISOString(), level, message, ...context, ...(fields ?? {}) });
    sink.write(serialize(record));
  };
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (childContext) => createLogger({ service: input.service, sink, context: { ...context, ...childContext } }),
  };
}

export const createPinoLogger = createLogger;

