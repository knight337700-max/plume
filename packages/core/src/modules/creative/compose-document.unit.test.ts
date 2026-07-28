import { describe, expect, it } from "vitest";
import { composeCreativeDocument } from "./compose-document.js";

describe("layout compose engine", () => {
  it("composes the Kakao Bizboard 1029x258 fixture with exact asset usage", () => {
    const document = composeCreativeDocument({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      creativeId: "creative-1",
      productId: "product-1",
      plan: {
        formatProfileId: "kakao-bizboard-v1",
        templateId: "kakao-template-v1",
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
            elementId: "hero",
            elementType: "IMAGE",
            slotCode: "hero",
            assetVersionId: "asset-version-1",
            x: 0,
            y: 0,
            width: 500,
            height: 258,
            zIndex: 1,
          },
        ],
        usedAssetVersionIds: ["asset-version-1"],
        copyAssets: {},
        rationale: "safe zone",
      },
      formatProfile: {
        id: "kakao-bizboard-v1",
        width: 1029,
        height: 258,
        transparentBackground: true,
      },
      template: { requiredAssetSlots: ["hero"] },
    });
    expect(document.canvas).toMatchObject({ width: 1029, height: 258 });
    expect(document.usedAssetVersionIds).toEqual(["asset-version-1"]);
  });

  it("rejects missing required template assets", () => {
    expect(() =>
      composeCreativeDocument({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        creativeId: "creative-1",
        productId: null,
        plan: {
          formatProfileId: "profile",
          templateId: "template",
          elements: [],
          usedAssetVersionIds: [],
          copyAssets: {},
          rationale: "missing",
        },
        formatProfile: { id: "profile", width: 100, height: 100 },
        template: { requiredAssetSlots: ["hero"] },
      }),
    ).toThrow(/REQUIRED_TEMPLATE_SLOT/);
  });
});
