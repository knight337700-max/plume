import { describe, expect, it } from "vitest";
import { createInMemoryCreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import { createGenerationItemComposer } from "./compose-generation-item.js";

describe("generation item composer", () => {
  it("composes a layout plan, creates one version, and records exact asset usage", async () => {
    const repositories = createInMemoryCreativeRepositories();
    const set = await repositories.createCreativeSet({
      id: "set-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    await repositories.createCreative({
      id: "creative-1",
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: "campaign-1",
      productId: "product-1",
      campaignFormatSelectionId: "selection-1",
    });
    const compose = createGenerationItemComposer({ creatives: repositories });
    const result = await compose({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      creativeId: "creative-1",
      productId: "product-1",
      briefVersionId: "brief-1",
      formatProfile: { id: "profile-1", width: 1029, height: 258, transparentBackground: false },
      template: { requiredAssetSlots: ["hero"] },
      layoutPlan: {
        formatProfileId: "profile-1",
        templateId: "template-1",
        elements: [
          {
            elementId: "hero-image",
            elementType: "IMAGE",
            slotCode: "hero",
            assetVersionId: "asset-1",
            x: 0,
            y: 0,
            width: 400,
            height: 258,
            zIndex: 1,
          },
        ],
        usedAssetVersionIds: ["asset-1"],
        copyAssets: {},
        rationale: "Hero first",
      },
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.creativeVersion.versionNo).toBe(1);
    expect(result.document.canvas.width).toBe(1029);
    expect(
      await repositories.listAssetUsages("workspace-1", result.creativeVersion.id),
    ).toMatchObject([{ assetVersionId: "asset-1", elementId: "hero-image" }]);
  });

  it("does not create a version when template composition fails", async () => {
    const repositories = createInMemoryCreativeRepositories();
    const set = await repositories.createCreativeSet({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    await repositories.createCreative({
      id: "creative-1",
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: "campaign-1",
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const compose = createGenerationItemComposer({ creatives: repositories });
    await expect(
      compose({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        creativeId: "creative-1",
        productId: null,
        briefVersionId: "brief-1",
        formatProfile: { id: "profile-1", width: 100, height: 100 },
        template: { requiredAssetSlots: ["hero"] },
        layoutPlan: {
          formatProfileId: "profile-1",
          templateId: null,
          elements: [],
          usedAssetVersionIds: [],
          copyAssets: {},
          rationale: "empty",
        },
      }),
    ).rejects.toThrow("REQUIRED_TEMPLATE_SLOT_MISSING:hero");
    expect(await repositories.listVersions("workspace-1", "creative-1")).toHaveLength(0);
  });
});
