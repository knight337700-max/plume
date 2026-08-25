import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createCopyGeneratorHandler } from "./generate-copy.js";
import { createLayoutPlannerHandler } from "./plan-layout.js";

describe("copy and layout agent handlers", () => {
  it("passes Kakao Bizboard slot limits and composes a bounded 1029x258 plan", async () => {
    const gateway: AgentProviderGateway = {
      execute: async (request) =>
        request.metadata.agentCode === "COPY_GENERATOR"
          ? {
              status: "COMPLETED",
              outputJson: {
                variants: [
                  { variantId: "v1", slots: { headline: "자코모 신제품" }, rationale: "fits" },
                ],
              },
              latencyMs: 1,
            }
          : {
              status: "COMPLETED",
              outputJson: {
                templateId: "kakao-template",
                elements: [
                  {
                    elementId: "background",
                    elementType: "BACKGROUND",
                    slotCode: "background",
                    x: 0,
                    y: 0,
                    width: 1029,
                    height: 258,
                    zIndex: 0,
                  },
                  {
                    elementId: "headline",
                    elementType: "TEXT",
                    slotCode: "headline",
                    x: 32,
                    y: 32,
                    width: 450,
                    height: 80,
                    zIndex: 2,
                    textValue: "자코모 신제품",
                  },
                ],
                usedAssetVersionIds: [],
                copyAssets: { headline: "자코모 신제품" },
                rationale: "safe zone",
                riskFlags: null,
              },
              latencyMs: 1,
            },
    };
    const orchestrator = createAgentOrchestrator({ gateway });
    const copyHandler = createCopyGeneratorHandler({ orchestrator });
    const copy = await copyHandler({
      taskId: "copy-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      productId: "product-1",
      product: { name: "JACOMO" },
      brief: { objective: "sales" },
      brandProfile: { tone: "warm" },
      textSlots: [{ code: "headline", maxUnits: 20 }],
      variantCount: 1,
      messages: [{ role: "user", content: "Copy." }],
    });
    expect(copy.status).toBe("COMPLETED");
    const layoutHandler = createLayoutPlannerHandler({ orchestrator });
    const layout = await layoutHandler({
      taskId: "layout-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      creativeId: "creative-1",
      productId: "product-1",
      channel: { code: "KAKAO_MOMENT" },
      formatProfile: { id: "kakao-profile", width: 1029, height: 258 },
      template: { id: "kakao-template" },
      assets: [],
      copyVariant: { headline: "자코모 신제품" },
      messages: [{ role: "user", content: "Layout." }],
    });
    expect(layout.status).toBe("COMPLETED");
    expect(layout.agentResult.output?.elements[0]?.width).toBe(1029);
  });

  it("rejects copy that exceeds a text slot", async () => {
    const orchestrator = createAgentOrchestrator({
      gateway: {
        execute: async () => ({
          status: "COMPLETED",
          outputJson: {
            variants: [{ variantId: "v1", slots: { headline: "too long" }, rationale: "bad" }],
          },
          latencyMs: 1,
        }),
      },
    });
    const handler = createCopyGeneratorHandler({ orchestrator });
    await expect(
      handler({
        taskId: "copy-2",
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        productId: "product-1",
        product: {},
        brief: {},
        brandProfile: {},
        textSlots: [{ code: "headline", maxUnits: 2 }],
        variantCount: 1,
        messages: [{ role: "user", content: "Copy." }],
      }),
    ).rejects.toThrow(/SLOT_LIMIT/);
  });
});
