import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import type { EnqueueCommandInput } from "../../../../../packages/core/src/async/command-publisher.js";

describe("generation routes", () => {
  it("returns an accepted generation request and exposes checkpointable items", async () => {
    const app = await buildApp();
    const campaign = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns",
      payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" },
    });
    const campaignId = campaign.json().data.id;
    const version = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions`,
      payload: { sourceKind: "MANUAL", contentJson: {} },
    });
    const versionId = version.json().data.id;
    await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions/${versionId}:confirm`,
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/generation-requests`,
      payload: {
        creativeSetName: "Launch set",
        generationMode: "ONE_CREATIVE_PER_PRODUCT",
        productIds: ["p1", "p2"],
        formatSelectionIds: ["format-1"],
        variantCountPerProduct: 2,
      },
    });
    expect(created.statusCode).toBe(202);
    const requestId = created.json().resource.id;
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/generation-requests/${requestId}`,
    });
    expect(detail.json().data.items).toHaveLength(4);
    await app.close();
  });

  it("enqueues Project generation with a server-frozen snapshot", async () => {
    const enqueued: EnqueueCommandInput<unknown>[] = [];
    const app = await buildApp({
      asyncCommandPublisher: {
        async enqueue(input) {
          enqueued.push(input);
          return {
            jobId: "00000000-0000-4000-8000-000000000011",
            jobItemId: "00000000-0000-4000-8000-000000000012",
            messageId: "00000000-0000-4000-8000-000000000013",
            correlationId: "00000000-0000-4000-8000-000000000011",
            status: "QUEUED" as const,
          };
        },
      },
      projectGenerationPreparer: {
        async prepare() {
          return {
            projectId: "project-1",
            briefVersionId: "brief-1",
            assetPoolSnapshot: [
              {
                assetVersionId: "asset-version-1",
                productId: null,
                roleCode: "LOGO",
                source: "PROJECT",
              },
            ],
          };
        },
      },
      projectFormatBindings: {
        async resolve() {
          return [
            {
              canonicalFormatKey: "kakao-moment-bizboard-1029x258",
              campaignFormatSelectionId: "00000000-0000-4000-8000-000000000014",
              formatProfileId: "00000000-0000-4000-8000-000000000015",
            },
          ];
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-1/campaigns/campaign-1/generation-requests",
      payload: {
        projectId: "project-1",
        productIds: ["product-1"],
        formatSelectionIds: ["format-1"],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      command: "creative.generate",
      payload: {
        projectId: "project-1",
        assetPoolSnapshot: [{ assetVersionId: "asset-version-1" }],
        formatProfileIds: ["kakao-moment-bizboard-1029x258"],
        formatBindings: [
          {
            campaignFormatSelectionId: "00000000-0000-4000-8000-000000000014",
            formatProfileId: "00000000-0000-4000-8000-000000000015",
          },
        ],
      },
    });
    await app.close();
  });
});
