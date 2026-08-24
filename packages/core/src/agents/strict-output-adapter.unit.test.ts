import { describe, expect, it } from "vitest";
import { createStrictOutputAdapter } from "./strict-output-adapter.js";
import { validateJson, type JsonSchema } from "./result-validator.js";

type ComposedJsonSchema = JsonSchema & {
  readonly $ref?: string;
  readonly oneOf?: readonly JsonSchema[];
};

describe("strict output validation evidence", () => {
  const layoutDomainSchema: JsonSchema = {
    type: "object",
    required: [
      "formatProfileId",
      "templateId",
      "elements",
      "usedAssetVersionIds",
      "copyAssets",
      "rationale",
    ],
    properties: {
      formatProfileId: { type: "string", format: "uuid" },
      templateId: { type: ["string", "null"] },
      elements: { type: "array", minItems: 0, items: { type: "object" } },
      usedAssetVersionIds: { type: "array", items: { type: "string" } },
      copyAssets: { type: "object", additionalProperties: { type: "string" } },
      rationale: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  };

  it("reproduces the prior layout domain paths without raw provider output", () => {
    const result = validateJson(
      {
        templateId: null,
        usedAssetVersionIds: [],
        copyAssets: {},
        rationale: "synthetic layout fixture",
      },
      layoutDomainSchema,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(["$.formatProfileId", "$.elements"]);
  });

  it("derives formatProfileId from input context while retaining required elements", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "layout-plan.schema.json",
      domainSchema: layoutDomainSchema,
      context: { formatProfile: { id: "00000000-0000-4000-8000-0000000002c3" } },
    });
    expect(adapter.transportSchema.properties?.formatProfileId).toBeUndefined();
    expect(adapter.transportSchema.required).toContain("elements");

    const result = adapter.decode({
      templateId: null,
      elements: [],
      usedAssetVersionIds: [],
      copyAssets: [],
      rationale: "synthetic empty layout plan",
    });
    expect(result.valid).toBe(true);
    expect(result.value).toMatchObject({
      formatProfileId: "00000000-0000-4000-8000-0000000002c3",
      elements: [],
    });
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "PASS",
      domainValidationStatus: "PASS",
    });
  });

  it("rejects a null model-generated elements array at transport", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "layout-plan.schema.json",
      domainSchema: layoutDomainSchema,
      context: { formatProfile: { id: "00000000-0000-4000-8000-0000000002c3" } },
    });
    const result = adapter.decode({
      templateId: null,
      elements: null,
      usedAssetVersionIds: [],
      copyAssets: [],
      rationale: "synthetic invalid layout plan",
    });
    expect(result.valid).toBe(false);
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "FAIL",
      domainValidationStatus: "NOT_REACHED",
    });
    expect(result.evidence?.transportErrorPaths).toContain("$.elements");
  });

  it("records transport validation even when the decoded domain value is already valid", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "asset-recommendation-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["rankedAssets"],
        properties: {
          rankedAssets: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    });
    const result = adapter.decode({ rankedAssets: [] });
    expect(result.valid).toBe(true);
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "PASS",
      domainValidationStatus: "PASS",
    });
  });

  it("records exact strict transport paths without values", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "layout-planner-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["placements"],
        properties: {
          placements: {
            type: "array",
            items: {
              type: "object",
              required: ["x"],
              properties: { x: { type: "number" } },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    });
    const result = adapter.decode({ placements: [{ unexpected: "redacted" }] });
    expect(result.valid).toBe(false);
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "FAIL",
      domainValidationStatus: "NOT_REACHED",
    });
    expect(result.evidence?.transportErrorPaths).toContain("$.placements[0].x");
    expect(JSON.stringify(result)).not.toContain("redacted");
  });

  it("separates transport success from domain failure", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "copy-generation-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["variants"],
        properties: {
          variants: {
            type: "array",
            items: {
              type: "object",
              required: ["variantId", "slots", "rationale"],
              properties: {
                variantId: { type: "string" },
                slots: { type: "object", additionalProperties: { type: "string" } },
                rationale: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    });
    const result = adapter.decode({
      variants: [
        {
          variantId: "v1",
          slots: [{ code: "headline", text: "" }],
          rationale: "synthetic",
          riskFlags: null,
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "PASS",
      domainValidationStatus: "FAIL",
    });
    expect(result.evidence?.domainErrorPaths).toContain("$.variants[0].slots[0].text");
    expect(JSON.stringify(result)).not.toContain("synthetic");
  });

  it("does not bypass strict transport for a domain-valid copy map", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "copy-generation-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["variants"],
        properties: {
          variants: {
            type: "array",
            items: {
              type: "object",
              required: ["variantId", "slots", "rationale"],
              properties: {
                variantId: { type: "string" },
                slots: { type: "object", additionalProperties: { type: "string" } },
                rationale: { type: "string" },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    });
    const result = adapter.decode({
      variants: [{ variantId: "v1", slots: { headline: "hello" }, rationale: "safe" }],
    });
    expect(result.valid).toBe(false);
    expect(result.evidence).toMatchObject({
      transportValidationStatus: "FAIL",
      domainValidationStatus: "NOT_REACHED",
    });
    expect(result.evidence?.transportErrorPaths).toContain("$.variants[0].slots");
  });

  it("projects provably disjoint oneOf branches to anyOf and preserves literals", () => {
    const background = {
      oneOf: [
        {
          type: "object",
          required: ["type"],
          properties: { type: { const: "TRANSPARENT" } },
          additionalProperties: false,
        },
        {
          type: "object",
          required: ["type", "color"],
          properties: {
            type: { const: "SOLID" },
            color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          },
          additionalProperties: false,
        },
      ],
    } as ComposedJsonSchema;
    const adapter = createStrictOutputAdapter({
      schemaId: "layout-plan.schema.json",
      domainSchema: {
        type: "object",
        required: ["background"],
        properties: { background },
        additionalProperties: false,
      },
    });
    const transportBackground = adapter.transportSchema.properties?.background as JsonSchema;
    expect((transportBackground as ComposedJsonSchema).oneOf).toBeUndefined();
    expect(transportBackground.anyOf).toHaveLength(2);
    expect((transportBackground.anyOf?.[0] as JsonSchema).properties?.type).toEqual({
      enum: ["TRANSPARENT"],
    });
    expect((transportBackground.anyOf?.[1] as JsonSchema).properties?.type).toEqual({
      enum: ["SOLID"],
    });
    expect((transportBackground.anyOf?.[1] as JsonSchema).properties?.color).toMatchObject({
      pattern: "^#[0-9A-Fa-f]{6}$",
    });
  });

  it("rejects a oneOf whose disjointness cannot be proven", () => {
    const nonDisjoint = {
      oneOf: [
        { type: "object", properties: { value: { type: "string" } } },
        { type: "object", properties: { value: { type: "string" } } },
      ],
    } as ComposedJsonSchema;
    expect(() =>
      createStrictOutputAdapter({
        schemaId: "non-disjoint-result.schema.json",
        domainSchema: { type: "object", properties: { value: nonDisjoint } },
      }),
    ).toThrow("STRICT_OUTPUT_ONE_OF_NOT_PROVABLY_DISJOINT");
  });

  it("rejects multiple composition keywords at one schema node", () => {
    const composed = {
      oneOf: [{ const: "A" }],
      anyOf: [{ const: "B" }],
    } as ComposedJsonSchema;
    expect(() =>
      createStrictOutputAdapter({
        schemaId: "multiple-composition-result.schema.json",
        domainSchema: { type: "object", properties: { value: composed } },
      }),
    ).toThrow("STRICT_OUTPUT_MULTIPLE_COMPOSITION_UNSUPPORTED");
  });

  it("preserves structural siblings beside anyOf and projected oneOf", () => {
    const anyOfSibling = {
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string" } },
      anyOf: [{ required: ["left"] }, { required: ["right"] }],
    } as JsonSchema;
    const oneOfSibling = {
      type: "object",
      required: ["shared"],
      properties: { shared: { type: "string" } },
      oneOf: [
        { required: ["mode"], properties: { mode: { const: "A" } } },
        { required: ["mode"], properties: { mode: { const: "B" } } },
      ],
    } as ComposedJsonSchema;
    const adapter = createStrictOutputAdapter({
      schemaId: "composition-sibling-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["anyOfSibling", "oneOfSibling"],
        properties: { anyOfSibling, oneOfSibling },
      },
    });
    const transportAnyOf = adapter.transportSchema.properties?.anyOfSibling as JsonSchema;
    const transportOneOf = adapter.transportSchema.properties?.oneOfSibling as JsonSchema;
    expect(transportAnyOf.type).toBe("object");
    expect(transportAnyOf.properties?.kind).toEqual({ type: "string" });
    expect(transportAnyOf.required).toContain("kind");
    expect(transportAnyOf.anyOf).toHaveLength(2);
    expect(transportOneOf.type).toBe("object");
    expect(transportOneOf.properties?.shared).toEqual({ type: "string" });
    expect(transportOneOf.required).toContain("shared");
    expect(transportOneOf.anyOf).toHaveLength(2);
  });

  it("fails closed if an unresolved reference reaches the adapter", () => {
    const unresolved = { $ref: "https://kbr.local/schema/missing.json" } as ComposedJsonSchema;
    expect(() =>
      createStrictOutputAdapter({
        schemaId: "unresolved-ref-result.schema.json",
        domainSchema: { type: "object", properties: { value: unresolved } },
      }),
    ).toThrow("STRICT_OUTPUT_UNRESOLVED_REF");
  });

  it("preserves type-less const semantics and validates the exact constant", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "const-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["schemaVersion"],
        properties: { schemaVersion: { const: "1.0.0" } },
        additionalProperties: false,
      },
    });
    expect(adapter.transportSchema.properties?.schemaVersion).toEqual({ enum: ["1.0.0"] });

    const accepted = validateJson({ schemaVersion: "1.0.0" }, adapter.transportSchema);
    expect(accepted.valid).toBe(true);

    const rejected = validateJson({ schemaVersion: "2.0.0" }, adapter.transportSchema);
    expect(rejected.valid).toBe(false);
    expect(rejected.errors).toContainEqual({
      path: "$.schemaVersion",
      keyword: "enum",
      message: "must be an allowed value",
    });
  });

  it("recursively preserves anyOf branches, nested const, and array items", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "any-of-result.schema.json",
      domainSchema: {
        type: "object",
        required: ["values"],
        properties: {
          values: {
            type: "array",
            items: { anyOf: [{ const: "READY" }, { type: "number" }] },
          },
        },
        additionalProperties: false,
      },
    });
    const values = adapter.transportSchema.properties?.values as JsonSchema;
    const items = values.items as JsonSchema;
    expect(values.type).toBe("array");
    expect(items.anyOf).toEqual([{ enum: ["READY"] }, { type: "number" }]);
    expect(JSON.stringify(items)).not.toContain("{}");
  });

  it("keeps optional const properties nullable without losing const semantics", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "optional-const-result.schema.json",
      domainSchema: {
        type: "object",
        properties: { mode: { const: "AUTO" } },
        additionalProperties: false,
      },
    });
    const mode = adapter.transportSchema.properties?.mode as JsonSchema;
    expect(adapter.transportSchema.required).toEqual(["mode"]);
    expect(mode.anyOf).toEqual([{ enum: ["AUTO"] }, { type: "null" }]);
  });
});
