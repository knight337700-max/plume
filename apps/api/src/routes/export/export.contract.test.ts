import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createInMemoryExportRepositories } from "../../../../../packages/core/src/modules/export/repositories.js";
import { createExportUseCases } from "../../../../../packages/core/src/modules/export/use-cases.js";
import { exportRouteGroup } from "./index.js";

describe("export routes", () => {
  it("accepts an export request and keeps file download authorization workspace-scoped", async () => {
    const repositories = createInMemoryExportRepositories();
    const useCases = createExportUseCases({ repositories, now: () => new Date("2026-07-29T00:00:00.000Z") });
    const app = Fastify({ logger: false });
    await app.register(exportRouteGroup, { useCases });
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/workspace-1/campaigns/campaign-1/export-jobs", headers: { "idempotency-key": "export-1", "x-user-id": "user-1" }, payload: { creativeVersionIds: ["version-1"], exportRecipeId: "recipe-1" } });
    expect(created.statusCode).toBe(202);
    expect(created.headers["operation-location"]).toContain("/export-jobs/");
    const jobId = created.json().resource.id as string;
    const idempotent = await app.inject({ method: "POST", url: "/api/v1/workspaces/workspace-1/campaigns/campaign-1/export-jobs", headers: { "idempotency-key": "export-1", "x-user-id": "user-1" }, payload: { creativeVersionIds: ["version-1"], exportRecipeId: "recipe-1" } });
    expect(idempotent.json().resource.id).toBe(jobId);
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/workspace-1/export-jobs" })).json().items).toHaveLength(1);

    await repositories.updateJob("workspace-1", jobId, { status: "COMPLETED", completedAt: "2026-07-29T00:01:00.000Z" });
    const file = await repositories.appendFile({ id: "file-1", workspaceId: "workspace-1", exportJobId: jobId, fileObjectId: "object-1", fileRole: "PACKAGE", relativePath: "package.zip" });
    const download = await app.inject({ method: "GET", url: `/api/v1/workspaces/workspace-1/export-files/${file.id}/download-url` });
    expect(download.statusCode).toBe(200);
    expect(download.json().data.url).toContain("signature=");
    expect((await app.inject({ method: "GET", url: `/api/v1/workspaces/workspace-2/export-files/${file.id}/download-url` })).statusCode).toBe(404);
    await app.close();
  });
});

