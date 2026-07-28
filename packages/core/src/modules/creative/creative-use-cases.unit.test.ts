import { describe, expect, it } from "vitest";
import { createCreativeUseCases } from "./creative-use-cases.js";
import { createInMemoryCreativeRepositories } from "./repositories.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "profile-1",
  canvas: { width: 200, height: 100, colorMode: "RGB" as const, transparentBackground: true },
  elements: [
    {
      id: "headline",
      type: "TEXT" as const,
      x: 10,
      y: 10,
      width: 100,
      height: 20,
      zIndex: 1,
      locked: false,
      visible: true,
      text: "Old",
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
};

async function fixture() {
  const repositories = createInMemoryCreativeRepositories();
  const set = await repositories.createCreativeSet({
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    name: "Set",
  });
  const creative = await repositories.createCreative({
    id: "creative-1",
    workspaceId: "workspace-1",
    creativeSetId: set.id,
    campaignId: "campaign-1",
    productId: null,
    campaignFormatSelectionId: "selection-1",
  });
  const version = await repositories.createVersion({
    id: "version-1",
    workspaceId: "workspace-1",
    creativeId: creative.id,
    formatProfileId: "profile-1",
    briefVersionId: "brief-1",
    documentJson: document,
  });
  return { repositories, creative, version, useCases: createCreativeUseCases({ repositories }) };
}

describe("creative use cases", () => {
  it("previews without mutation, applies as a new version, and requires confirmation", async () => {
    const { repositories, version, useCases } = await fixture();
    const batch = {
      operations: [
        {
          operationId: "copy",
          action: "UPDATE_TEXT" as const,
          targetIds: ["headline"],
          payload: { text: "New" },
        },
      ],
      requiresUserConfirmation: true,
    };
    const preview = await useCases.previewEdit({
      workspaceId: "workspace-1",
      versionId: version.id,
      batch,
      expectedRevision: 1,
    });
    expect(preview.after.elements[0]?.text).toBe("New");
    expect(await repositories.listVersions("workspace-1", "creative-1")).toHaveLength(1);
    await expect(
      useCases.applyEdit({ workspaceId: "workspace-1", versionId: version.id, batch }),
    ).rejects.toMatchObject({ code: "USER_CONFIRMATION_REQUIRED" });
    const applied = await useCases.applyEdit({
      workspaceId: "workspace-1",
      versionId: version.id,
      batch,
      confirmed: true,
    });
    expect(applied.parentVersionId).toBe(version.id);
    expect(await repositories.listEditOperations("workspace-1", applied.id)).toHaveLength(1);
  });

  it("autosaves with optimistic locking and queues render requests", async () => {
    const { repositories, version, useCases } = await fixture();
    const saved = await useCases.autosave({
      workspaceId: "workspace-1",
      versionId: version.id,
      documentJson: document,
      expectedRevision: 1,
    });
    expect(saved.revisionNo).toBe(2);
    await expect(
      useCases.autosave({
        workspaceId: "workspace-1",
        versionId: version.id,
        documentJson: document,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "REVISION_MISMATCH" });
    const job = await useCases.requestRender({
      workspaceId: "workspace-1",
      versionId: version.id,
      purpose: "PREVIEW",
      idempotencyKey: "render-key",
    });
    expect(job).toMatchObject({ id: "render-key", status: "QUEUED" });
    await expect(useCases.get("workspace-2", "creative-1")).resolves.toBeNull();
    expect(await repositories.listRenders("workspace-1", version.id)).toHaveLength(0);
  });
});
