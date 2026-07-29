import type { FastifyPluginAsync } from "fastify";
import type { JobUseCases } from "../../../../../packages/core/src/modules/operations/job-use-cases.js";

export interface JobRouteOptions { readonly useCases: JobUseCases }
interface Params { readonly workspaceId: string; readonly jobId: string }
interface RequestLike { readonly params: Params; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined> }
function request(value: unknown): RequestLike { return value as RequestLike; }
function list(items: readonly unknown[], query?: Record<string, unknown>) { const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50))); return { items: items.slice(0, limit), page: { limit, nextCursor: null } }; }

export const jobRoutes: FastifyPluginAsync<JobRouteOptions> = async (app, options) => {
  app.get("/api/v1/workspaces/:workspaceId/jobs", { config: { operationId: "listJobs" } }, async (value) => {
    const input = request(value);
    const query = input.query ?? {};
    return list(await options.useCases.list(input.params.workspaceId, { ...(query.status ? { status: String(query.status) as never } : {}), ...(query.jobType ? { jobType: String(query.jobType) } : {}) }), query);
  });
  app.get("/api/v1/workspaces/:workspaceId/jobs/:jobId", { config: { operationId: "getJob" } }, async (value, reply) => {
    const input = request(value);
    const job = await options.useCases.get(input.params.workspaceId, input.params.jobId);
    if (!job) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    reply.header("ETag", `W/\"job-${job.id}-${job.status}-${job.progressPercent}\"`);
    return { data: job };
  });
  app.get("/api/v1/workspaces/:workspaceId/jobs/:jobId/items", { config: { operationId: "listJobItems" } }, async (value) => {
    const input = request(value);
    return list(await options.useCases.listItems(input.params.workspaceId, input.params.jobId), input.query);
  });
  app.post("/api/v1/workspaces/:workspaceId/jobs/:jobId.cancel", { config: { operationId: "cancelJob", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER"] } }, async (value) => {
    const input = request(value);
    return { data: await options.useCases.cancel(input.params.workspaceId, input.params.jobId) };
  });
  app.post("/api/v1/workspaces/:workspaceId/jobs/:jobId.retry", { config: { operationId: "retryJob", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER"] } }, async (value, reply) => {
    const input = request(value);
    const job = await options.useCases.retry(input.params.workspaceId, input.params.jobId);
    const location = `/api/v1/workspaces/${input.params.workspaceId}/jobs/${job.id}`;
    reply.header("Operation-Location", location).header("Location", location).header("Retry-After", "3");
    return reply.code(202).send({ job: { id: job.id, status: job.status }, resource: job, links: { self: location } });
  });
};

