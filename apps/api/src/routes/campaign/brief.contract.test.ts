import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("campaign source and brief routes", () => {
  it("attaches sources, creates and idempotently confirms a brief version", async () => {
    const app = await buildApp();
    const campaignResponse = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns", payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" } });
    const campaignId = campaignResponse.json().data.id;
    const source = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/sources`, payload: { fileObjectId: "file-1", sourceType: "UPLOAD" } });
    expect(source.statusCode).toBe(201);
    const version = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions`, payload: { sourceKind: "MANUAL", contentJson: { objective: "sales" } } });
    expect(version.statusCode).toBe(201);
    const versionId = version.json().data.id;
    const first = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions/${versionId}:confirm` });
    const second = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/brief/versions/${versionId}:confirm` });
    expect(first.statusCode).toBe(200);
    expect(second.json().data.staleDownstream).toEqual({ matching: false, recommendations: false, generation: false });
    await app.close();
  });
});
