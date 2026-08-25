import { describe, expect, it } from "vitest";
import { serializeRedactedJsonStringArray } from "./live-smoke-jsonb.js";

describe("live smoke JSONB string-array serializer", () => {
  it("serializes missing and empty readonly arrays as JSON arrays", () => {
    expect(serializeRedactedJsonStringArray(undefined)).toBe("[]");
    expect(serializeRedactedJsonStringArray(Object.freeze([]))).toBe("[]");
  });

  it("deduplicates while preserving first-seen order without mutating input", () => {
    const input = Object.freeze(["$.first", "$.second", "$.first"]);
    expect(serializeRedactedJsonStringArray(input)).toBe('["$.first","$.second"]');
    expect(input).toEqual(["$.first", "$.second", "$.first"]);
  });

  it("supports an allowlist and a maximum of twenty values", () => {
    const input = Array.from({ length: 25 }, (_, index) => `$.path${index}`);
    expect(
      JSON.parse(
        serializeRedactedJsonStringArray(input, {
          accept: (value) => !value.endsWith("3"),
        }),
      ),
    ).toHaveLength(20);
    expect(serializeRedactedJsonStringArray(input, { maximumItems: 0 })).toBe("[]");
  });

  it("emits only strings and a JSON array root for runtime-unknown input", () => {
    const input = ["$.valid", 42, null, "$.valid"] as unknown as readonly string[];
    const parsed: unknown = JSON.parse(serializeRedactedJsonStringArray(input));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(["$.valid"]);
    expect((parsed as unknown[]).every((value) => typeof value === "string")).toBe(true);
  });
});
