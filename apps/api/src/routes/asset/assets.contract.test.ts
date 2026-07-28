import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("asset routes", () => {
  it("supports asset lifecycle, conditional archive and async asset operations", async () => {
    const app = await buildApp();
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/brands/brand-1/assets", payload: { name: "Hero", assetType: "IMAGE", licenseStatus: "VALID" } });
    expect(created.statusCode).toBe(201);
    const asset = created.json().data;
    const current = await app.inject({ method: "GET", url: `/api/v1/workspaces/ws-1/assets/${asset.id}` });
    expect(current.headers.etag).toBe('W/"revision-1"');
    const updated = await app.inject({ method: "PATCH", url: `/api/v1/workspaces/ws-1/assets/${asset.id}`, headers: { "if-match": 'W/"revision-1"' }, payload: { name: "Hero Updated" } });
    expect(updated.statusCode).toBe(200);
    const analyzed = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/assets/${asset.id}:analyze` });
    expect(analyzed.statusCode).toBe(202);
    const archived = await app.inject({ method: "DELETE", url: `/api/v1/workspaces/ws-1/assets/${asset.id}`, headers: { "if-match": 'W/"revision-2"' } });
    expect(archived.statusCode).toBe(204);
    await app.close();
  });
});
