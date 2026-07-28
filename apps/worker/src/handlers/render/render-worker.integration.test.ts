import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInMemoryCreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import { renderCreativeDocument } from "../../../../../packages/infrastructure/src/render/renderer-adapter.js";
import { createRenderWorkerHandler } from "./render-worker.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "profile-1",
  canvas: { width: 100, height: 50, colorMode: "RGB" as const, transparentBackground: false },
  elements: [
    {
      id: "shape",
      type: "SHAPE" as const,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      zIndex: 1,
      locked: false,
      visible: true,
      style: { fill: "#123456" },
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

describe("render worker handler", () => {
  it("is idempotent and records private file plus creative render exactly once", async () => {
    const creatives = createInMemoryCreativeRepositories();
    const set = await creatives.createCreativeSet({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    const creative = await creatives.createCreative({
      id: "creative-1",
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: "campaign-1",
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const version = await creatives.createVersion({
      id: "version-1",
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      briefVersionId: "brief-1",
      documentJson: document,
    });
    let puts = 0;
    let files = 0;
    let renders = 0;
    const handler = createRenderWorkerHandler({
      creatives: {
        getCreative: creatives.getCreative,
        getVersion: creatives.getVersion,
        createRender: async (...args) => {
          renders += 1;
          return creatives.createRender(...args);
        },
      },
      renderer: { render: renderCreativeDocument },
      storage: {
        async put(input) {
          puts += 1;
          const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
          return {
            bucket: "private",
            objectKey: input.objectKey,
            bytes: input.body.byteLength,
            checksumSha256,
          };
        },
      },
      files: {
        async create(fileObject) {
          files += 1;
          return fileObject;
        },
      },
    });
    const input = {
      requestId: "request-1",
      workspaceId: "workspace-1",
      creativeVersionId: version.id,
      purpose: "PREVIEW" as const,
      outputProfile: { mimeType: "image/png" as const, width: 100, height: 50 },
    };
    const first = await handler.handle(input);
    const second = await handler.handle(input);
    expect(first.status).toBe("COMPLETED");
    expect(second).toEqual(first);
    expect({ puts, files, renders }).toEqual({ puts: 1, files: 1, renders: 1 });
  });

  it("returns partial success for a mixed batch and rejects stale versions", async () => {
    const creatives = createInMemoryCreativeRepositories();
    const set = await creatives.createCreativeSet({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      name: "Set",
    });
    const creative = await creatives.createCreative({
      id: "creative-1",
      workspaceId: "workspace-1",
      creativeSetId: set.id,
      campaignId: "campaign-1",
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const first = await creatives.createVersion({
      id: "version-1",
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      briefVersionId: "brief-1",
      documentJson: document,
    });
    const current = await creatives.createVersion({
      id: "version-2",
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      briefVersionId: "brief-1",
      documentJson: document,
      parentVersionId: first.id,
    });
    const handler = createRenderWorkerHandler({
      creatives,
      renderer: { render: renderCreativeDocument },
      storage: {
        async put(input) {
          const checksumSha256 = createHash("sha256").update(input.body).digest("hex");
          return {
            bucket: "private",
            objectKey: input.objectKey,
            bytes: input.body.byteLength,
            checksumSha256,
          };
        },
      },
      files: {
        async create(fileObject) {
          return fileObject;
        },
      },
    });
    const result = await handler.handleBatch([
      {
        requestId: "stale",
        workspaceId: "workspace-1",
        creativeVersionId: first.id,
        purpose: "PREVIEW",
        outputProfile: { mimeType: "image/png", width: 100, height: 50 },
      },
      {
        requestId: "current",
        workspaceId: "workspace-1",
        creativeVersionId: current.id,
        purpose: "PREVIEW",
        outputProfile: { mimeType: "image/png", width: 100, height: 50 },
      },
    ]);
    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.completedCount).toBe(1);
    expect(result.items.find((item) => item.requestId === "stale")?.error).toMatchObject({
      code: "STALE_CREATIVE_VERSION",
    });
  });
});
