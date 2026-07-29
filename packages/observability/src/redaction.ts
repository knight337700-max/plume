const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|prompt|prompt[_-]?body|private[_-]?key|client[_-]?secret)/i;

export const REDACTED_VALUE = "[REDACTED]";

export function redact<T>(value: T, key?: string): T {
  if (key && SENSITIVE_KEY.test(key)) return REDACTED_VALUE as T;
  if (Array.isArray(value)) return value.map((item) => redact(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)])) as T;
  }
  return value;
}

export function redactLogContext(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return redact(value);
}

