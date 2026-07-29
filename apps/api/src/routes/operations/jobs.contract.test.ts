import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createInMemoryJobQueryRepository, createJobUseCases } from "../../../../../packages/core/src/modules/operations/job-use-cases.js";
import { operationsRouteGroup } from "./index.js";

describe("job routes", () => {
  it("supports filters, item listing and 202 retry without losing completed items", async () => {
    const repository = createInMemoryJobQueryRepository({ jobs: [{ id: "job-1", workspaceId: "ws-1", status: "FAILED", progressPercent: 50, attemptNo: 0, maxAttempts: 3 }], items: [{ id: "item-1", jobId: "job-1", itemKey: "done", status: "COMPLETED", progressPercent: 100 }, { id: "item-2", jobId: "job-1", itemKey: "failed", status: "FAILED", progressPercent: 40 }] });
    const app = Fastify({ logger: false });
    await app.register(operationsRouteGroup, { jobs: createJobUseCases(repository) });
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/jobs?status=FAILED" })).json().items).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/jobs/job-1/items" })).json().items).toHaveLength(2);
    const retried = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/jobs/job-1.retry" });
    expect(retried.statusCode).toBe(202);
    expect(retried.headers["operation-location"]).toContain("/jobs/job-1");
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/jobs/job-1/items" })).json().items).toEqual(expect.arrayContaining([expect.objectContaining({ itemKey: "done", status: "COMPLETED" }), expect.objectContaining({ itemKey: "failed", status: "QUEUED" })]));
    await app.close();
  });
});

