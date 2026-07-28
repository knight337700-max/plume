import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("asset file routes", () => {
  it("supports create, multipart part issuance, complete and abort operations", async () => {
    const app = await buildApp();
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/uploads", payload: { filename: "asset.png", mimeType: "image/png", bytes: 10, purpose: "ASSET" } });
    expect(created.statusCode).toBe(201);
    const session = created.json();
    expect(session.id).toBeTypeOf("string");
    const multipart = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/uploads", payload: { filename: "catalog.csv", mimeType: "text/csv", bytes: 10, purpose: "IMPORT", multipartPreferred: true } });
    const multipartSession = multipart.json();
    const parts = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/uploads/${multipartSession.id}/parts`, payload: { partNumbers: [1, 2] } });
    expect(parts.statusCode).toBe(201);
    const completed = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/uploads/${multipartSession.id}:complete`, payload: { checksumSha256: "not-verified", parts: [{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }] } });
    expect(completed.statusCode).toBe(200);
    const aborted = await app.inject({ method: "POST", url: `/api/v1/workspaces/ws-1/uploads/${session.id}:abort` });
    expect(aborted.statusCode).toBe(204);
    await app.close();
  });
});
