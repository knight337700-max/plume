import { describe, expect, it } from "vitest";
import { createStrictOutputAdapter } from "./strict-output-adapter.js";
import { validateJson, type JsonSchema } from "./result-validator.js";

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
    expect(result.errors.map((error) => error.path)).toEqual([
      "$.formatProfileId",
      "$.elements",
    ]);
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
    expect(result.evidence?.domainErrorPaths).toContain(
      "$.variants[0].slots[0].text",
    );
    expect(JSON.stringify(result)).not.toContain("synthetic");
  });
});
