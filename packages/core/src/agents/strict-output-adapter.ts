import {
  validateJson,
  type JsonSchema,
  type SchemaError,
  type ValidationResult,
} from "./result-validator.js";

export interface StrictOutputAdapter<TTransport = unknown, TDomain = unknown> {
  readonly schemaId: string;
  readonly transportSchema: JsonSchema;
  decode(value: unknown): ValidationResult<TDomain>;
}

const COPY_GENERATION_SCHEMA_ID = "copy-generation-result.schema.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function schemaTypes(schema: JsonSchema): readonly string[] {
  if (Array.isArray(schema.type)) return schema.type.map(String);
  return typeof schema.type === "string" ? [schema.type] : [];
}

function nullable(schema: JsonSchema): JsonSchema {
  const types = schemaTypes(schema);
  if (types.includes("null")) return schema;
  if (types.length === 1) return { ...schema, type: [types[0]!, "null"] };
  return { anyOf: [schema, { type: "null" }] };
}

function dynamicValueSchema(schema: JsonSchema): JsonSchema | undefined {
  return schema.additionalProperties && typeof schema.additionalProperties === "object"
    ? schema.additionalProperties
    : undefined;
}

function isDynamicObject(schema: JsonSchema): boolean {
  return (
    schemaTypes(schema).includes("object") &&
    !schema.properties &&
    schema.additionalProperties !== undefined &&
    schema.additionalProperties !== false
  );
}

function scalarKeywords(
  schema: JsonSchema,
): Pick<
  JsonSchema,
  | "description"
  | "enum"
  | "minLength"
  | "minItems"
  | "maxItems"
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "uniqueItems"
> {
  return {
    ...(schema.description === undefined ? {} : { description: schema.description }),
    ...(schema.enum === undefined ? {} : { enum: schema.enum }),
    ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }),
    ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }),
    ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }),
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
    ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
    ...(schema.exclusiveMinimum === undefined ? {} : { exclusiveMinimum: schema.exclusiveMinimum }),
    ...(schema.uniqueItems === undefined ? {} : { uniqueItems: schema.uniqueItems }),
  };
}

function buildTransportSchema(schema: JsonSchema): JsonSchema {
  if (isDynamicObject(schema)) {
    const valueSchema = dynamicValueSchema(schema);
    const valueProperty = valueSchema
      ? { value: buildTransportSchema(valueSchema) }
      : { valueJson: { type: "string" } as JsonSchema };
    return {
      type: "array",
      ...scalarKeywords(schema),
      items: {
        type: "object",
        properties: { key: { type: "string" }, ...valueProperty },
        required: Object.keys(valueProperty).concat("key"),
        additionalProperties: false,
      },
    };
  }

  const types = schemaTypes(schema);
  if (types.includes("object")) {
    const properties = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [
        key,
        nullable(buildTransportSchema(child)),
      ]),
    );
    return {
      type: types.includes("null") ? ["object", "null"] : "object",
      ...scalarKeywords(schema),
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }
  if (types.includes("array"))
    return {
      type: types.includes("null") ? ["array", "null"] : "array",
      ...scalarKeywords(schema),
      ...(schema.items ? { items: buildTransportSchema(schema.items) } : {}),
    };
  return schema.type === undefined
    ? scalarKeywords(schema)
    : { type: schema.type, ...scalarKeywords(schema) };
}

const copyTransportSchema: JsonSchema = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          variantId: { type: "string", minLength: 1 },
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string", minLength: 1 },
                text: { type: "string" },
              },
              required: ["code", "text"],
              additionalProperties: false,
            },
          },
          rationale: { type: "string", minLength: 1 },
          riskFlags: { type: ["array", "null"], items: { type: "string" } },
        },
        required: ["variantId", "slots", "rationale", "riskFlags"],
        additionalProperties: false,
      },
    },
  },
  required: ["variants"],
  additionalProperties: false,
};

function failure(path: string, keyword: string, message: string): ValidationResult<never> {
  return { valid: false, errors: [{ path, keyword, message }] };
}

function parseJsonValue(value: unknown, path: string): ValidationResult<unknown> {
  if (typeof value !== "string") return failure(path, "type", "must be a JSON string");
  try {
    return { valid: true, value: JSON.parse(value), errors: [] };
  } catch {
    return failure(path, "json", "must contain valid JSON");
  }
}

function decodeDynamicMap(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: SchemaError[],
): unknown {
  if (!Array.isArray(value)) {
    errors.push({ path, keyword: "type", message: "must be a strict key-value array" });
    return {};
  }
  const result: Record<string, unknown> = {};
  const valueSchema = dynamicValueSchema(schema);
  for (const [index, entry] of value.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry) || typeof entry.key !== "string") {
      errors.push({ path: entryPath, keyword: "type", message: "must contain a string key" });
      continue;
    }
    if (!entry.key.trim()) {
      errors.push({ path: `${entryPath}.key`, keyword: "minLength", message: "must not be empty" });
      continue;
    }
    if (hasOwn(result, entry.key)) {
      errors.push({
        path: `${entryPath}.key`,
        keyword: "uniqueItems",
        message: "duplicate dynamic key",
      });
      continue;
    }
    let decodedValue: unknown;
    if (valueSchema) {
      if (hasOwn(entry, "value")) decodedValue = entry.value;
      else {
        const parsed = parseJsonValue(entry.valueJson, `${entryPath}.valueJson`);
        if (!parsed.valid) {
          errors.push(...parsed.errors);
          continue;
        }
        decodedValue = parsed.value;
      }
      const validatedValue = validateJson(decodedValue, valueSchema);
      if (!validatedValue.valid) {
        errors.push(
          ...validatedValue.errors.map((error) => ({
            ...error,
            path: `${entryPath}.${error.path === "$" ? "value" : `value${error.path.slice(1)}`}`,
          })),
        );
        continue;
      }
    } else {
      const parsed = parseJsonValue(entry.valueJson, `${entryPath}.valueJson`);
      if (!parsed.valid) {
        errors.push(...parsed.errors);
        continue;
      }
      decodedValue = parsed.value;
    }
    result[entry.key] = decodedValue;
  }
  return result;
}

function decodeGeneric(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: SchemaError[],
): unknown {
  if (isDynamicObject(schema)) return decodeDynamicMap(value, schema, path, errors);
  if (Array.isArray(value) && schema.items)
    return value.map((item, index) =>
      decodeGeneric(item, schema.items!, `${path}[${index}]`, errors),
    );
  if (!isRecord(value) || !schema.properties) return value;
  const result: Record<string, unknown> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, child] of Object.entries(schema.properties)) {
    if (!hasOwn(value, key)) continue;
    if (value[key] === null && !required.has(key)) continue;
    result[key] = decodeGeneric(value[key], child, `${path}.${key}`, errors);
  }
  for (const key of Object.keys(value))
    if (!hasOwn(schema.properties, key)) result[key] = value[key];
  return result;
}

function decodeWithSchema<T>(
  value: unknown,
  transportSchema: JsonSchema,
  domainSchema: JsonSchema,
  decode: (value: unknown, errors: SchemaError[]) => unknown,
): ValidationResult<T> {
  const directDomain = validateJson<T>(value, domainSchema);
  if (directDomain.valid)
    return {
      ...directDomain,
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "NOT_REACHED",
        transportErrorPaths: [],
        domainValidationStatus: "PASS",
        domainErrorPaths: [],
      },
    };
  const transport = validateJson(value, transportSchema);
  if (!transport.valid)
    return {
      ...transport,
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "FAIL",
        transportErrorCode: "STRICT_TRANSPORT_SCHEMA_INVALID",
        transportErrorPaths: transport.errors.map((error) => error.path),
        domainValidationStatus: "NOT_REACHED",
        domainErrorPaths: [],
      },
    };
  const errors: SchemaError[] = [];
  const domainValue = decode(value, errors);
  if (errors.length)
    return {
      valid: false,
      errors: Object.freeze(errors),
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "PASS",
        transportErrorPaths: [],
        domainValidationStatus: "FAIL",
        domainErrorCode: "DOMAIN_SCHEMA_INVALID",
        domainErrorPaths: errors.map((error) => error.path),
      },
    };
  const domain = validateJson<T>(domainValue, domainSchema);
  return {
    ...domain,
    evidence: {
      jsonParseStatus: "PASS",
      transportValidationStatus: "PASS",
      transportErrorPaths: [],
      domainValidationStatus: domain.valid ? "PASS" : "FAIL",
      ...(domain.valid ? {} : { domainErrorCode: "DOMAIN_SCHEMA_INVALID" }),
      domainErrorPaths: domain.valid ? [] : domain.errors.map((error) => error.path),
    },
  };
}

function copyDecode(value: unknown, domainSchema: JsonSchema): ValidationResult<unknown> {
  const directDomain = validateJson(value, domainSchema);
  if (directDomain.valid)
    return {
      ...directDomain,
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "NOT_REACHED",
        transportErrorPaths: [],
        domainValidationStatus: "PASS",
        domainErrorPaths: [],
      },
    };
  const transport = validateJson(value, copyTransportSchema);
  if (!transport.valid)
    return {
      ...transport,
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "FAIL",
        transportErrorCode: "STRICT_TRANSPORT_SCHEMA_INVALID",
        transportErrorPaths: transport.errors.map((error) => error.path),
        domainValidationStatus: "NOT_REACHED",
        domainErrorPaths: [],
      },
    };
  const source = value as { variants: readonly Record<string, unknown>[] };
  const errors: SchemaError[] = [];
  const variants = source.variants.map((variant, index) => {
    const slots: Record<string, string> = {};
    for (const [slotIndex, entry] of (
      variant.slots as readonly Record<string, unknown>[]
    ).entries()) {
      const path = `$.variants[${index}].slots[${slotIndex}]`;
      const code = String(entry.code ?? "");
      const text = String(entry.text ?? "");
      if (!code.trim())
        errors.push({ path: `${path}.code`, keyword: "minLength", message: "must not be empty" });
      if (!text.trim())
        errors.push({ path: `${path}.text`, keyword: "minLength", message: "must not be empty" });
      if (hasOwn(slots, code))
        errors.push({
          path: `${path}.code`,
          keyword: "uniqueItems",
          message: "duplicate slot code",
        });
      slots[code] = text;
    }
    const decoded: Record<string, unknown> = {
      variantId: variant.variantId,
      slots,
      rationale: variant.rationale,
    };
    if (Array.isArray(variant.riskFlags) && variant.riskFlags.length)
      decoded.riskFlags = variant.riskFlags;
    return decoded;
  });
  if (errors.length)
    return {
      valid: false,
      errors: Object.freeze(errors),
      evidence: {
        jsonParseStatus: "PASS",
        transportValidationStatus: "PASS",
        transportErrorPaths: [],
        domainValidationStatus: "FAIL",
        domainErrorCode: "DOMAIN_SCHEMA_INVALID",
        domainErrorPaths: errors.map((error) => error.path),
      },
    };
  const domain = validateJson({ variants }, domainSchema);
  return {
    ...domain,
    evidence: {
      jsonParseStatus: "PASS",
      transportValidationStatus: "PASS",
      transportErrorPaths: [],
      domainValidationStatus: domain.valid ? "PASS" : "FAIL",
      ...(domain.valid ? {} : { domainErrorCode: "DOMAIN_SCHEMA_INVALID" }),
      domainErrorPaths: domain.valid ? [] : domain.errors.map((error) => error.path),
    },
  };
}

export function createStrictOutputAdapter<TDomain = unknown>(input: {
  readonly schemaId: string;
  readonly domainSchema: JsonSchema;
}): StrictOutputAdapter<unknown, TDomain> {
  const copyVariants = input.domainSchema.properties?.variants;
  const copySlots = copyVariants?.items?.properties?.slots;
  if (input.schemaId === COPY_GENERATION_SCHEMA_ID && copySlots?.additionalProperties !== undefined)
    return {
      schemaId: input.schemaId,
      transportSchema: copyTransportSchema,
      decode(value) {
        return copyDecode(value, input.domainSchema) as ValidationResult<TDomain>;
      },
    };
  const transportSchema = buildTransportSchema(input.domainSchema);
  return {
    schemaId: input.schemaId,
    transportSchema,
    decode(value) {
      return decodeWithSchema<TDomain>(
        value,
        transportSchema,
        input.domainSchema,
        (current, errors) => decodeGeneric(current, input.domainSchema, "$", errors),
      );
    },
  };
}

export function buildStrictTransportSchemaForLinter(domainSchema: JsonSchema): JsonSchema {
  return buildTransportSchema(domainSchema);
}
