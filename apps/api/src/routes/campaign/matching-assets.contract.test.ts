import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("campaign matching and asset pool routes", () => {
  it("returns async run responses and exposes confirmation resources", async () => {
    const app = await buildApp();
    const campaign = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns", payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" } });
    const campaignId = campaign.json().data.id;
    const matching = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/product-matching:run`, payload: {} });
    expect(matching.statusCode).toBe(202);
    const pool = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/asset-pool` });
    expect(pool.statusCode).toBe(200);
    await app.close();
  });
});
