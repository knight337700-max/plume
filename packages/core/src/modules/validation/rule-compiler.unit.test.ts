import { describe, expect, it } from "vitest";
import { compileValidationRuleBundle } from "./rule-compiler.js";

describe("validation rule compiler", () => {
  it("lets advertiser rules override lower scopes while retaining unrelated rules", () => {
    const result = compileValidationRuleBundle(
      {
        sourceVersion: "catalog-1",
        ruleSets: [
          {
            id: "global-set",
            scope: "GLOBAL",
            version: "1",
            rules: [
              { id: "DIMENSION", target: "CANVAS", operator: "EQ", value: 1, severity: "ERROR", message: "global" },
              { id: "MIME", target: "FILE", operator: "IN", value: ["image/png"], severity: "ERROR", message: "mime" },
            ],
          },
          {
            id: "advertiser-set",
            scope: "ADVERTISER",
            version: "2",
            rules: [{ id: "DIMENSION", target: "CANVAS", operator: "EQ", value: 2, severity: "ERROR", message: "advertiser" }],
          },
        ],
      },
      { asOf: new Date("2026-07-29T00:00:00.000Z") },
    );
    expect(result.rules).toHaveLength(2);
    expect(result.rules.find((rule) => rule.id === "DIMENSION")?.message).toBe("advertiser");
    expect(result.rules.find((rule) => rule.id === "MIME")?.message).toBe("mime");
  });

  it("calculates scheduled severity and stable hash", () => {
    const input = {
      sourceVersion: "catalog-1",
      rules: [{ id: "FUTURE", target: "CANVAS", operator: "EQ", value: 1, severity: "SCHEDULED" as const, message: "future", effectiveFrom: "2027-01-01", warningFrom: "2026-04-01" }],
    };
    const first = compileValidationRuleBundle(input, { asOf: new Date("2026-07-29T00:00:00.000Z") });
    const second = compileValidationRuleBundle(input, { asOf: new Date("2026-07-29T00:00:00.000Z") });
    expect(first.rules[0]?.activation).toBe("WARNING");
    expect(first.hash).toBe(second.hash);
    expect(first.snapshotId).toBe(second.snapshotId);
  });
});
