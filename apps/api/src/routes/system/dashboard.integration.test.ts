import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerDashboardRoute } from "./dashboard.js";

describe("dashboard route", () => {
  it("returns the required workspace summary sections", async () => {
    const app = Fastify();
    await registerDashboardRoute(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/dashboard" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ campaigns: {}, approvals: {}, jobs: {}, exports: {}, activity: [] });
    expect(response.headers.etag).toContain("dashboard-ws-1");
    await app.close();
  });
});
