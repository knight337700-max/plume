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

  it("passes channel and format context only to agents that require media routing", () => {
    const mediaContext = {
      channel: { id: "KAKAO_MOMENT", label: "Kakao Moment" },
      formatProfile: { id: "kakao-moment-bizboard-1029x258", channelCode: "KAKAO_MOMENT" },
      unrelated: "not included",
    };
    for (const agentCode of ["ASSET_CURATOR", "LAYOUT_PLANNER", "AI_POLICY_REVIEWER", "EXPORT_ASSISTANT"] as const) {
      const context = buildAgentContext({
        agentCode,
        workspaceId: "workspace-1",
        subjectType: "CAMPAIGN",
        subjectId: "campaign-1",
        data: mediaContext,
      });
      expect(context.data).toMatchObject({ channel: mediaContext.channel, formatProfile: mediaContext.formatProfile });
      expect(context.data).not.toHaveProperty("unrelated");
    }
    const campaignContext = buildAgentContext({
      agentCode: "CAMPAIGN_ANALYST",
      workspaceId: "workspace-1",
      subjectType: "CAMPAIGN",
      subjectId: "campaign-1",
      data: mediaContext,
    });
    expect(campaignContext.data).not.toHaveProperty("channel");
    expect(campaignContext.data).not.toHaveProperty("formatProfile");
  });
});
