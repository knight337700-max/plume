import { describe, expect, it } from "vitest";
import { createInMemoryCreativeRepositories } from "./repositories.js";
import { parseCreativeDocument } from "./creative-document.js";

const doc = parseCreativeDocument({
  schemaVersion: "1.0.0",
  formatProfileId: "profile-1",
  canvas: { width: 300, height: 200, colorMode: "RGB", transparentBackground: true },
  elements: [
    {
      id: "headline",
      type: "TEXT",
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      zIndex: 1,
      locked: false,
      visible: true,
      text: "Hello",
    },
  ],
  usedAssetVersionIds: [],
  copyAssets: {},
  metadata: {
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    creativeId: "creative-1",
    productId: null,
  },
});

describe("creative repositories", () => {
  it("keeps workspace scope, appends versions, and freezes draft content", async () => {
    const repositories = createInMemoryCreativeRepositories();
    const set = await repositories.createCreativeSet({
      id: "set-1",
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    const creative = await repositories.createCreative({
      id: "creative-1",
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: set.campaignId,
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const version = await repositories.createVersion({
      id: "version-1",
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      layoutTemplateId: null,
      briefVersionId: "brief-1",
      documentJson: doc,
      copyAssetsJson: {},
      generationMetadataJson: {},
    });
    expect(
      (await repositories.listVersions("workspace-1", creative.id)).map((item) => item.versionNo),
    ).toEqual([1]);
    expect((await repositories.getCreative("workspace-1", creative.id))?.currentVersionId).toBe(
      version.id,
    );
    const updated = await repositories.updateDraftVersion(
      "workspace-1",
      version.id,
      { documentJson: doc },
      1,
    );
    expect(updated.revisionNo).toBe(2);
    const frozen = await repositories.freezeVersion("workspace-1", version.id);
    expect(frozen.status).toBe("READY_FOR_APPROVAL");
    await expect(
      repositories.updateDraftVersion("workspace-1", version.id, { documentJson: doc }),
    ).rejects.toMatchObject({ code: "IMMUTABLE_VERSION" });
    expect(await repositories.getVersion("workspace-2", version.id)).toBeNull();
  });

  it("records append-only usages, operations, and renders", async () => {
    const repositories = createInMemoryCreativeRepositories();
    const set = await repositories.createCreativeSet({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    const creative = await repositories.createCreative({
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: "campaign-1",
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const version = await repositories.createVersion({
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      briefVersionId: "brief-1",
      documentJson: doc,
    });
    await repositories.addAssetUsages([
      {
        workspaceId: "workspace-1",
        creativeVersionId: version.id,
        assetVersionId: "asset-1",
        usageType: "IMAGE",
        transformJson: {},
      },
    ]);
    await repositories.appendEditOperations([
      {
        workspaceId: "workspace-1",
        creativeVersionId: version.id,
        source: "USER",
        operationJson: { action: "MOVE" },
      },
    ]);
    const render = await repositories.createRender({
      workspaceId: "workspace-1",
      creativeVersionId: version.id,
      renderPurpose: "PREVIEW",
      fileObjectId: "file-1",
      renderConfigJson: {},
    });
    expect(await repositories.listAssetUsages("workspace-1", version.id)).toHaveLength(1);
    expect((await repositories.listEditOperations("workspace-1", version.id))[0]?.operationNo).toBe(
      1,
    );
    expect((await repositories.listRenders("workspace-1", version.id))[0]?.id).toBe(render.id);
  });
});
