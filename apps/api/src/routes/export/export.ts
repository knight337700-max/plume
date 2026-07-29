import type { FastifyPluginAsync } from "fastify";
import type { ExportUseCases } from "../../../../../packages/core/src/modules/export/use-cases.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { InMemoryIdempotencyRepository } from "../../idempotency/repository.js";
import { runIdempotent } from "../../idempotency/middleware.js";

export interface ExportRouteOptions { readonly useCases: ExportUseCases; readonly idempotency?: IdempotencyRepository }
interface Params { readonly workspaceId: string; readonly campaignId: string; readonly exportJobId: string; readonly fileId: string }
interface RequestLike { readonly params: Params; readonly body?: unknown; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined>; readonly session?: { readonly userId?: string } }
function request(value: unknown): RequestLike { return value as RequestLike; }
function body(value: unknown): Record<string, unknown> { const candidate = request(value).body; return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {}; }
function header(value: unknown, name: string): string | undefined { const candidate = request(value).headers?.[name.toLowerCase()]; return Array.isArray(candidate) ? candidate[0] : candidate; }
function actor(value: unknown): string { return request(value).session?.userId ?? header(value, "x-user-id") ?? "system-user"; }
function list(items: readonly unknown[], query?: Record<string, unknown>) { const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50))); return { items: items.slice(0, limit), page: { limit, nextCursor: null } }; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function stringMap(value: unknown): Record<string, string> { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}; }

export const exportRoutes: FastifyPluginAsync<ExportRouteOptions> = async (app, options) => {
  const idempotency = options.idempotency ?? new InMemoryIdempotencyRepository();
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/export-jobs", { config: { operationId: "createExportJob", roles: ["OWNER", "ADMIN", "REVIEWER"] } }, async (value, reply) => {
    const input = request(value);
    const payload = body(value);
    const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(value, "idempotency-key") ?? "", body: payload }, async () => {
      const creativeVersionIds = stringArray(payload.creativeVersionIds);
      const recipe = payload.exportRecipe && typeof payload.exportRecipe === "object" && !Array.isArray(payload.exportRecipe) ? payload.exportRecipe as Record<string, unknown> : {};
      const job = await options.useCases.create({ workspaceId: input.params.workspaceId, campaignId: input.params.campaignId, requestedBy: actor(value), creativeVersionIds, exportRecipeId: String(payload.exportRecipeId ?? recipe.id ?? "export-recipe"), optionsJson: payload });
      const location = `/api/v1/workspaces/${input.params.workspaceId}/export-jobs/${job.id}`;
      return { statusCode: 202, body: { job: { id: job.asyncJobId ?? job.id, status: "QUEUED" }, resource: job, links: { self: location } } };
    });
    const resource = result.body as { resource?: { id?: string } };
    const jobId = resource.resource?.id ?? "";
    const location = `/api/v1/workspaces/${input.params.workspaceId}/export-jobs/${jobId}`;
    reply.header("Operation-Location", location).header("Location", location).header("Retry-After", "3");
    return reply.code(result.statusCode).send(result.body);
  });
  app.get("/api/v1/workspaces/:workspaceId/export-jobs", { config: { operationId: "listExportJobs" } }, async (value) => {
    const input = request(value);
    return list(await options.useCases.list(input.params.workspaceId), input.query);
  });
  app.get("/api/v1/workspaces/:workspaceId/export-jobs/:exportJobId", { config: { operationId: "getExportJob" } }, async (value, reply) => {
    const input = request(value);
    const job = await options.useCases.get(input.params.workspaceId, input.params.exportJobId);
    if (!job) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    reply.header("ETag", `W/\"export-${job.id}-${job.status}\"`);
    return { data: job };
  });
  app.get("/api/v1/workspaces/:workspaceId/export-jobs/:exportJobId/files", { config: { operationId: "listExportFiles" } }, async (value) => {
    const input = request(value);
    return list(await options.useCases.listFiles(input.params.workspaceId, input.params.exportJobId), input.query);
  });
  app.post("/api/v1/workspaces/:workspaceId/export-jobs/:exportJobId.cancel", { config: { operationId: "cancelExportJob", roles: ["OWNER", "ADMIN", "REVIEWER"] } }, async (value, reply) => {
    const input = request(value);
    const payload = body(value);
    const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(value, "idempotency-key") ?? `cancel:${input.params.exportJobId}`, body: payload }, async () => ({ statusCode: 200, body: { data: await options.useCases.cancel(input.params.workspaceId, input.params.exportJobId) } }));
    return reply.code(result.statusCode).send(result.body);
  });
  app.post("/api/v1/workspaces/:workspaceId/export-jobs/:exportJobId.retry", { config: { operationId: "retryExportJob", roles: ["OWNER", "ADMIN", "REVIEWER"] } }, async (value, reply) => {
    const input = request(value);
    const payload = body(value);
    const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(value, "idempotency-key") ?? `retry:${input.params.exportJobId}`, body: payload }, async () => {
      const job = await options.useCases.retry(input.params.workspaceId, input.params.exportJobId);
      const location = `/api/v1/workspaces/${input.params.workspaceId}/export-jobs/${job.id}`;
      return { statusCode: 202, body: { job: { id: job.asyncJobId ?? job.id, status: "QUEUED" }, resource: job, links: { self: location } } };
    });
    const resource = result.body as { resource?: { id?: string } };
    const jobId = resource.resource?.id ?? input.params.exportJobId;
    reply.header("Operation-Location", `/api/v1/workspaces/${input.params.workspaceId}/export-jobs/${jobId}`).header("Retry-After", "3");
    return reply.code(result.statusCode).send(result.body);
  });
  app.get("/api/v1/workspaces/:workspaceId/export-files/:fileId/download-url", { config: { operationId: "getExportFileDownloadUrl" } }, async (value, reply) => {
    const input = request(value);
    try { return { data: await options.useCases.getDownloadUrl({ workspaceId: input.params.workspaceId, fileId: input.params.fileId }) }; }
    catch (error) { const statusCode = (error as { statusCode?: number }).statusCode ?? 500; return reply.code(statusCode).send({ code: (error as { code?: string }).code ?? "INTERNAL_ERROR", message: (error as Error).message }); }
  });
};

