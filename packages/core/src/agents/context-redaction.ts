const SECRET_KEY = /(password|token|secret|authorization|api[-_]?key|cookie|session|credential)/iu;

export interface RedactionResult {
  readonly value: unknown;
  readonly paths: readonly string[];
}

export function redactSensitiveContext(
  value: unknown,
  path = "$",
  paths: string[] = [],
): RedactionResult {
  if (Array.isArray(value)) {
    const items = value.map(
      (item, index) => redactSensitiveContext(item, `${path}[${index}]`, paths).value,
    );
    return { value: items, paths };
  }
  if (!value || typeof value !== "object") return { value, paths };
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY.test(key)) {
      paths.push(childPath);
      continue;
    }
    output[key] = redactSensitiveContext(child, childPath, paths).value;
  }
  return { value: output, paths };
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
