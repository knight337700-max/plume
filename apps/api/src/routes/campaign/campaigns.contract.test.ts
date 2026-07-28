import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("campaign routes", () => {
  it("creates campaigns, returns workflow blockers and preserves archived history", async () => {
    const app = await buildApp();
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns", payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" } });
    expect(created.statusCode).toBe(201);
    const campaign = created.json().data;
    const workflow = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaign.id}/workflow` });
    expect(workflow.json().data.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SOURCES_REQUIRED" })]));
    const archived = await app.inject({ method: "DELETE", url: `/api/v1/workspaces/ws-1/campaigns/${campaign.id}`, headers: { "if-match": 'W/"revision-1"' } });
    expect(archived.statusCode).toBe(204);
    const detail = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/campaigns/${campaign.id}` });
    expect(detail.json().data.status).toBe("ARCHIVED");
    await app.close();
  });
});
