import { describe, expect, it } from "vitest";
import { createStrictOutputAdapter } from "./strict-output-adapter.js";

describe("strict output validation evidence", () => {
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
