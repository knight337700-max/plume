import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("campaign media selection routes", () => {
  it("persists idempotent channel selections and exposes options/selections", async () => {
    const app = await buildApp();
    const campaign = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns", payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" } });
    const campaignId = campaign.json().data.id;
    const update = await app.inject({ method: "PUT", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/channels`, payload: { items: [{ channelCode: "KAKAO_MOMENT" }] } });
    expect(update.statusCode).toBe(200);
    const channels = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/channels` });
    expect(channels.json().items).toHaveLength(1);
    const formats = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-options?channelCode=KAKAO_MOMENT` });
    expect(formats.statusCode).toBe(200);
    await app.close();
  });
});
