import { describe, expect, it } from "vitest";
import { buildAgentContext } from "./context-builder.js";

describe("agent context builder", () => {
  it("builds a minimal deterministic Jacomo context and redacts secrets", () => {
    const input = {
      agentCode: "CAMPAIGN_ANALYST" as const,
      workspaceId: "workspace-1",
      subjectType: "CAMPAIGN",
      subjectId: "campaign-1",
      data: {
        sourceText: "JACOMO summer campaign",
        citations: [{ sourceId: "source-1" }],
        brandProfile: { tone: "warm", apiKey: "never-pass" },
        unrelated: "not included",
      },
    };
    const first = buildAgentContext(input);
    const second = buildAgentContext({ ...input, data: { ...input.data, unrelated: "changed" } });
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.data).not.toHaveProperty("unrelated");
    expect(first.data.brandProfile).toEqual({ tone: "warm" });
    expect(first.redactionSummary).toContain("$.brandProfile.apiKey");
  });

  it("rejects cross-workspace context before hashing", () => {
    expect(() =>
      buildAgentContext({
        agentCode: "PRODUCT_MATCHER",
        workspaceId: "workspace-1",
        subjectType: "CAMPAIGN",
        subjectId: "campaign-1",
        data: { candidates: [{ workspaceId: "workspace-2" }] },
      }),
    ).toThrow(/Cross-workspace/);
  });
});
