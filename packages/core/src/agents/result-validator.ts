export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly anyOf?: readonly JsonSchema[];
  readonly description?: string;
  readonly format?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly title?: string;
  readonly $schema?: string;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly uniqueItems?: boolean;
}

export interface SchemaError {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export interface ValidationSuccess<T> {
  readonly valid: true;
  readonly value: T;
  readonly errors: readonly [];
}
export interface ValidationFailure {
  readonly valid: false;
  readonly errors: readonly SchemaError[];
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function typeMatches(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object")
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function visit(value: unknown, schema: JsonSchema, path: string, errors: SchemaError[]): void {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push({ path, keyword: "type", message: `must be ${types.join(" or ")}` });
      return;
    }
  }
  if (schema.enum && !schema.enum.some((candidate) => equalValue(candidate, value)))
    errors.push({ path, keyword: "enum", message: "must be an allowed value" });
  if (schema.const !== undefined && !equalValue(schema.const, value))
    errors.push({ path, keyword: "const", message: "must equal the registered constant" });
  if (
    typeof value === "string" &&
    schema.minLength !== undefined &&
    value.length < schema.minLength
  )
    errors.push({
      path,
      keyword: "minLength",
      message: `must contain at least ${schema.minLength} characters`,
    });
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push({ path, keyword: "minimum", message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push({ path, keyword: "maximum", message: `must be <= ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      errors.push({
        path,
        keyword: "exclusiveMinimum",
        message: `must be > ${schema.exclusiveMinimum}`,
      });
  }
  if (Array.isArray(value)) {
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      errors.push({ path, keyword: "uniqueItems", message: "must contain unique items" });
    if (schema.items)
      value.forEach((item, index) => visit(item, schema.items!, `${path}[${index}]`, errors));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    for (const required of schema.required ?? [])
      if (!Object.prototype.hasOwnProperty.call(objectValue, required))
        errors.push({ path: `${path}.${required}`, keyword: "required", message: "is required" });
    for (const [key, child] of Object.entries(objectValue)) {
      const childSchema = schema.properties?.[key];
      if (!childSchema && schema.additionalProperties === false)
        errors.push({
          path: `${path}.${key}`,
          keyword: "additionalProperties",
          message: "is not allowed",
        });
      else if (childSchema) visit(child, childSchema, `${path}.${key}`, errors);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object")
        visit(child, schema.additionalProperties, `${path}.${key}`, errors);
    }
  }
}

export function validateJson<T = unknown>(value: unknown, schema: JsonSchema): ValidationResult<T> {
  const errors: SchemaError[] = [];
  visit(value, schema, "$", errors);
  return errors.length
    ? { valid: false, errors: Object.freeze(errors) }
    : { valid: true, value: value as T, errors: [] };
}

export function parseAndValidate<T = unknown>(
  raw: string | unknown,
  schema: JsonSchema,
): ValidationResult<T> {
  let value: unknown;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {
        valid: false,
        errors: [{ path: "$", keyword: "json", message: "must be valid JSON" }],
      };
    }
  } else value = raw;
  return validateJson<T>(value, schema);
}
