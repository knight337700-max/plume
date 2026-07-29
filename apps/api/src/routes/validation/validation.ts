import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ValidationUseCases } from "../../../../../packages/core/src/modules/validation/use-cases.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { InMemoryIdempotencyRepository } from "../../idempotency/repository.js";
import { runIdempotent } from "../../idempotency/middleware.js";

export interface ValidationRouteOptions {
  readonly useCases: ValidationUseCases;
  readonly idempotency?: IdempotencyRepository;
}
interface RequestParams { readonly workspaceId: string; readonly versionId: string; readonly validationRunId: string; readonly resultId: string }
interface RequestLike { readonly params: RequestParams; readonly body?: unknown; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined>; readonly session?: { readonly userId?: string } }
function request(request: unknown): RequestLike { return request as RequestLike; }
function body(requestValue: unknown): Record<string, unknown> { const value = request(requestValue).body; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function header(requestValue: unknown, name: string): string | undefined { const value = request(requestValue).headers?.[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
function userId(requestValue: unknown): string { return request(requestValue).session?.userId ?? header(requestValue, "x-user-id") ?? "system-user"; }
function page(value: readonly unknown[], queryValue: Record<string, unknown> | undefined) { const limit = Math.max(1, Math.min(200, Number(queryValue?.limit ?? 50))); return { items: value.slice(0, limit), page: { limit, nextCursor: null } }; }

export const validationRoutes: FastifyPluginAsync<ValidationRouteOptions> = async (app, options) => {
  const idempotency = options.idempotency ?? new InMemoryIdempotencyRepository();
  app.post("/api/v1/workspaces/:workspaceId/creative-versions/:versionId/validation-runs", { config: { operationId: "createValidationRun", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER"] } }, async (requestValue, reply) => {
    const input = request(requestValue);
    const value = body(requestValue);
    const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(requestValue, "idempotency-key") ?? "", body: value }, async () => {
      const run = await options.useCases.run({ workspaceId: input.params.workspaceId, creativeVersionId: input.params.versionId, ...(value.ruleSetMode ? { ruleSnapshotJson: { mode: value.ruleSetMode } } : {}), requestedBy: userId(requestValue) });
      const location = `/api/v1/workspaces/${input.params.workspaceId}/jobs/${run.id}`;
      return { statusCode: 202, body: { job: { id: run.id, status: run.status }, resource: run, links: { self: location } } };
    });
    const jobId = (result.body as { job?: { id?: string } }).job?.id ?? randomUUID();
    const location = `/api/v1/workspaces/${input.params.workspaceId}/jobs/${jobId}`;
    reply.header("Operation-Location", location).header("Location", `/api/v1/workspaces/${input.params.workspaceId}/creative-versions/${input.params.versionId}/validation-runs`).header("Retry-After", "2");
    return reply.code(result.statusCode).send(result.body);
  });
  app.get("/api/v1/workspaces/:workspaceId/creative-versions/:versionId/validation-runs", { config: { operationId: "listValidationRuns" } }, async (requestValue) => {
    const input = request(requestValue);
    return page(await options.useCases.listRuns(input.params.workspaceId, input.params.versionId), input.query);
  });
  app.get("/api/v1/workspaces/:workspaceId/validation-runs/:validationRunId", { config: { operationId: "getValidationRun" } }, async (requestValue, reply) => {
    const input = request(requestValue);
    const run = await options.useCases.getRun(input.params.workspaceId, input.params.validationRunId);
    if (!run) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    reply.header("ETag", `W/\"validation-${run.id}-${run.runNo}\"`);
    return { data: run };
  });
  app.get("/api/v1/workspaces/:workspaceId/validation-runs/:validationRunId/results", { config: { operationId: "listValidationResults" } }, async (requestValue) => {
    const input = request(requestValue);
    return page(await options.useCases.listResults(input.params.workspaceId, input.params.validationRunId), input.query);
  });
  app.post("/api/v1/workspaces/:workspaceId/validation-results/:resultId.acknowledge", { config: { operationId: "acknowledgeValidationWarning", roles: ["OWNER", "ADMIN", "REVIEWER"] } }, async (requestValue) => {
    const input = request(requestValue);
    const value = body(requestValue);
    return { data: await options.useCases.acknowledgeWarning({ workspaceId: input.params.workspaceId, resultId: input.params.resultId, acknowledgedBy: userId(requestValue), reason: String(value.reason ?? "") }) };
  });
};
