import { describe, expect, it } from "vitest";
import { aggregateValidationFindings } from "./aggregate-results.js";

const deterministic = {
  ruleCode: "DIMENSION",
  ruleId: "DIMENSION",
  severity: "ERROR" as const,
  message: "dimension",
  resultType: "DETERMINISTIC" as const,
  targetType: "CANVAS",
  targetElementIds: [],
  sourceRuleVersion: "1",
  details: {},
};

describe("validation finding aggregation", () => {
  it("never lowers deterministic ERROR and merges evidence by stable key", () => {
    const result = aggregateValidationFindings(
      [deterministic],
      [
        {
          ruleCode: "DIMENSION",
          severity: "WARNING",
          confidence: 1,
          message: "ai explanation",
          targetElementIds: [],
          evidence: ["pixel metadata"],
        },
      ],
    );
    expect(result.status).toBe("ERROR");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ severity: "ERROR", resultType: "DETERMINISTIC", evidence: ["pixel metadata"] });
  });

  it("normalizes low confidence AI ERROR to WARNING and is input-order independent", () => {
    const ai = [
      { ruleCode: "COPY", severity: "ERROR" as const, confidence: 0.4, message: "copy", targetElementIds: ["b", "a"] },
      { ruleCode: "COPY", severity: "WARNING" as const, confidence: 0.4, message: "copy", targetElementIds: ["a", "b"] },
    ];
    const first = aggregateValidationFindings([], ai);
    const second = aggregateValidationFindings([], [...ai].reverse());
    expect(first.status).toBe("WARNING");
    expect(first).toEqual(second);
  });
});
