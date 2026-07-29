import type { FastifyPluginAsync } from "fastify";
import type { ApprovalUseCases } from "../../../../../packages/core/src/modules/approval/use-cases.js";
import type { WorkspaceRole } from "../../../../../packages/core/src/modules/iam/repositories.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { InMemoryIdempotencyRepository } from "../../idempotency/repository.js";
import { runIdempotent } from "../../idempotency/middleware.js";

export interface ApprovalRouteOptions { readonly useCases: ApprovalUseCases; readonly idempotency?: IdempotencyRepository }
interface Params { readonly workspaceId: string; readonly versionId: string; readonly approvalId: string }
interface RequestLike { readonly params: Params; readonly body?: unknown; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined>; readonly session?: { readonly userId?: string } }
function request(value: unknown): RequestLike { return value as RequestLike; }
function body(value: unknown): Record<string, unknown> { const candidate = request(value).body; return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {}; }
function header(value: unknown, name: string): string | undefined { const candidate = request(value).headers?.[name.toLowerCase()]; return Array.isArray(candidate) ? candidate[0] : candidate; }
function actor(value: unknown): string { return request(value).session?.userId ?? header(value, "x-user-id") ?? "system-user"; }
function role(value: unknown): WorkspaceRole { return (header(value, "x-workspace-role") ?? "REVIEWER") as WorkspaceRole; }
function list(items: readonly unknown[], query?: Record<string, unknown>) { const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50))); return { items: items.slice(0, limit), page: { limit, nextCursor: null } }; }

export const approvalRoutes: FastifyPluginAsync<ApprovalRouteOptions> = async (app, options) => {
  const idempotency = options.idempotency ?? new InMemoryIdempotencyRepository();
  app.post("/api/v1/workspaces/:workspaceId/creative-versions/:versionId/approval-requests", { config: { operationId: "createApprovalRequest", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (value, reply) => {
    const input = request(value);
    const payload = body(value);
    const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(value, "idempotency-key") ?? "", body: payload }, async () => ({ statusCode: 201, body: { data: await options.useCases.createRequest({ workspaceId: input.params.workspaceId, creativeVersionId: input.params.versionId, validationRunId: String(payload.validationRunId ?? ""), requestedBy: actor(value), actorRole: role(value), selfApprovalAllowed: header(value, "x-self-approval") === "true", ...(payload.assigneeId === undefined ? {} : { assigneeId: payload.assigneeId as string | null }) }) } }));
    return reply.code(result.statusCode).send(result.body);
  });
  app.get("/api/v1/workspaces/:workspaceId/approval-requests", { config: { operationId: "listApprovalRequests" } }, async (value) => {
    const input = request(value);
    const query = input.query ?? {};
    return list(await options.useCases.listRequests(input.params.workspaceId, { ...(query.status ? { status: String(query.status) as never } : {}), ...(query.assigneeId ? { assigneeId: String(query.assigneeId) } : {}) }), query);
  });
  app.get("/api/v1/workspaces/:workspaceId/approval-requests/:approvalId", { config: { operationId: "getApprovalRequest" } }, async (value, reply) => {
    const input = request(value);
    const item = await options.useCases.getRequest(input.params.workspaceId, input.params.approvalId);
    if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    reply.header("ETag", `W/\"approval-${item.id}-${item.status}\"`);
    return { data: item };
  });
  const decide = (operationId: "approveRequest" | "rejectRequest", decision: "APPROVED" | "REJECTED") => app.post(`/api/v1/workspaces/:workspaceId/approval-requests/:approvalId.${decision === "APPROVED" ? "approve" : "reject"}`, { config: { operationId, roles: ["OWNER", "ADMIN", "REVIEWER"] } }, async (value) => {
    const input = request(value);
    const payload = body(value);
    const item = await options.useCases.getRequest(input.params.workspaceId, input.params.approvalId);
    if (!item) return { code: "RESOURCE_NOT_FOUND" };
    return { data: await options.useCases.decide({ workspaceId: input.params.workspaceId, approvalRequestId: input.params.approvalId, decision, actorId: actor(value), actorRole: role(value), selfApprovalAllowed: header(value, "x-self-approval") === "true", currentCreativeVersionId: item.creativeVersionId, ...(payload.comment === undefined ? {} : { comment: payload.comment as string | null }), ...(payload.warningReason === undefined ? {} : { warningReason: payload.warningReason as string | null }) }) };
  });
  decide("approveRequest", "APPROVED");
  decide("rejectRequest", "REJECTED");
  app.post("/api/v1/workspaces/:workspaceId/approval-requests/:approvalId.cancel", { config: { operationId: "cancelApprovalRequest", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (value) => {
    const input = request(value);
    return { data: await options.useCases.cancel({ workspaceId: input.params.workspaceId, approvalRequestId: input.params.approvalId, actorId: actor(value) }) };
  });
};
