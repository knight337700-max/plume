import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createCreativeUseCases } from "../../../../../packages/core/src/modules/creative/creative-use-cases.js";
import { createInMemoryCreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import { creativeRouteGroup } from "./index.js";

describe("creative routes", () => {
  it("serves creative query, autosave, edit, and render request contracts", async () => {
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
      campaignId: "campaign-1",
      productId: null,
      campaignFormatSelectionId: "selection-1",
    });
    const document = {
      schemaVersion: "1.0.0" as const,
      formatProfileId: "profile-1",
      canvas: { width: 100, height: 50, colorMode: "RGB" as const, transparentBackground: true },
      elements: [
        {
          id: "title",
          type: "TEXT" as const,
          x: 0,
          y: 0,
          width: 50,
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
    const version = await repositories.createVersion({
      id: "version-1",
      workspaceId: "workspace-1",
      creativeId: creative.id,
      formatProfileId: "profile-1",
      briefVersionId: "brief-1",
      documentJson: document,
    });
    const app = Fastify({ logger: false });
    await app.register(creativeRouteGroup, { useCases: createCreativeUseCases({ repositories }) });
    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces/workspace-1/creative-sets/set-1/creatives",
    });
    expect(listed.statusCode).toBe(200);
    const saved = await app.inject({
      method: "PATCH",
      url: "/api/v1/workspaces/workspace-1/creative-versions/version-1",
      headers: { "if-match": 'W/"revision-1"' },
      payload: { document },
    });
    expect(saved.statusCode).toBe(200);
    const rendered = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/creative-versions/version-1.render",
      headers: { "idempotency-key": "render-1" },
      payload: { purpose: "PREVIEW" },
    });
    expect(rendered.statusCode).toBe(202);
    expect(rendered.headers["operation-location"]).toContain("/jobs/");
    await app.close();
  });
});
