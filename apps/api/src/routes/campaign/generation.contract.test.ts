import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("generation routes", () => {
  it("returns an accepted generation request and exposes checkpointable items", async () => {
    const app = await buildApp();
    const campaign = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns", payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" } });
    const campaignId = campaign.json().data.id;
    const version = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions`, payload: { sourceKind: "MANUAL", contentJson: {} } });
    const versionId = version.json().data.id;
    await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions/${versionId}:confirm` });
    const created = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/generation-requests`, payload: { creativeSetName: "Launch set", generationMode: "ONE_CREATIVE_PER_PRODUCT", productIds: ["p1", "p2"], formatSelectionIds: ["format-1"], variantCountPerProduct: 2 } });
    expect(created.statusCode).toBe(202);
    const requestId = created.json().resource.id;
    const detail = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/generation-requests/${requestId}` });
    expect(detail.json().data.items).toHaveLength(4);
    await app.close();
  });
});
