import { describe, expect, it } from "vitest";
// eslint-disable-next-line no-restricted-imports -- contract tests exercise the workspace core source directly.
import { createStrictOutputAdapter, type JsonSchema } from "../../core/src/public.js";
import { agentSchemas } from "./agent-schemas/index.js";
import { lintStrictAgentSchemas } from "./strict-schema-lint.js";

const copySchema = (agentSchemas as Readonly<Record<string, unknown>>)[
  "copy-generation-result.schema.json"
] as JsonSchema;

describe("strict output adapters", () => {
  it("lints all eight live agent output schemas", () => {
    const results = lintStrictAgentSchemas();
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.issues.length === 0)).toBe(true);
  });

  it("uses an array transport for COPY_GENERATOR slots", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "copy-generation-result.schema.json",
      domainSchema: copySchema,
    });
    expect(adapter.transportSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["variants"],
    });
    const variants = (adapter.transportSchema.properties?.variants as JsonSchema)
      .items as JsonSchema;
    expect((variants.properties?.slots as JsonSchema).type).toBe("array");
    expect((variants.properties?.riskFlags as JsonSchema).required).toBeUndefined();
    expect(variants.required).toEqual(["variantId", "slots", "rationale", "riskFlags"]);
  });

  it("decodes slots, removes nullable optional riskFlags, and validates the domain", () => {
    const adapter = createStrictOutputAdapter<{ variants: unknown[] }>({
      schemaId: "copy-generation-result.schema.json",
      domainSchema: copySchema,
    });
    const decoded = adapter.decode({
      variants: [
        {
          variantId: "v1",
          slots: [{ code: "headline", text: "Synthetic sofa" }],
          rationale: "synthetic fixture",
          riskFlags: null,
        },
      ],
    });
    expect(decoded).toMatchObject({
      valid: true,
      value: {
        variants: [
          {
            variantId: "v1",
            slots: { headline: "Synthetic sofa" },
            rationale: "synthetic fixture",
          },
        ],
      },
    });
  });

  it("rejects duplicate or empty slot codes and unknown transport fields", () => {
    const adapter = createStrictOutputAdapter({
      schemaId: "copy-generation-result.schema.json",
      domainSchema: copySchema,
    });
    const duplicate = adapter.decode({
      variants: [
        {
          variantId: "v1",
          slots: [
            { code: "headline", text: "one" },
            { code: "headline", text: "two" },
          ],
          rationale: "fixture",
          riskFlags: [],
        },
      ],
    });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.valid ? duplicate.value : undefined).toBeUndefined();
    if (!duplicate.valid)
      expect(duplicate.errors.some((error) => error.path.includes("slots[1].code"))).toBe(true);

    const empty = adapter.decode({
      variants: [
        { variantId: "v1", slots: [{ code: "", text: "" }], rationale: "fixture", riskFlags: [] },
      ],
    });
    expect(empty.valid).toBe(false);
    const unknown = adapter.decode({
      variants: [],
      unknown: true,
    });
    expect(unknown.valid).toBe(false);
  });
});
