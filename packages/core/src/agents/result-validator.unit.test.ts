import { describe, expect, it } from "vitest";
import { validateWithOneRepair } from "./result-repair.js";
import { parseAndValidate } from "./result-validator.js";

const schema = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", minLength: 1 } },
      },
    },
  },
} as const;

describe("agent result validation and repair", () => {
  it("accepts valid JSON and repairs using only schema error paths once", async () => {
    expect(parseAndValidate('{"items":[{"id":"p1"}]}', schema).valid).toBe(true);
    let attempts = 0;
    const result = await validateWithOneRepair<{ items: { id: string }[] }>({
      raw: '{"items":[{}]}',
      schema,
      repair: (request) => {
        attempts += 1;
        expect(request).not.toHaveProperty("raw");
        expect(request.errorPaths[0]?.path).toBe("$.items[0].id");
        return { items: [{ id: "p1" }] };
      },
    });
    expect(attempts).toBe(1);
    expect(result).toMatchObject({
      status: "SUCCESS",
      repairAttempts: 1,
      value: { items: [{ id: "p1" }] },
    });
  });

  it("does not deliver permanently invalid output to a handler", async () => {
    let attempts = 0;
    const result = await validateWithOneRepair({
      raw: "not-json",
      schema,
      repair: () => {
        attempts += 1;
        return { wrong: true };
      },
    });
    expect(attempts).toBe(1);
    expect(result.status).toBe("PERMANENT_FAILURE");
    expect(result).toMatchObject({ repairAttempts: 1 });
  });
});
