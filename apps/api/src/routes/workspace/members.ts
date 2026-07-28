import type { FastifyPluginAsync } from "fastify";
import type { ActorContext, WorkspaceUseCases } from "../../../../../packages/core/src/modules/iam/workspace-use-cases.js";
import type { WorkspaceRole } from "../../../../../packages/core/src/modules/iam/repositories.js";
import { etagForRevision } from "../../concurrency/etag.js";

interface Options { readonly useCases: WorkspaceUseCases }
function actor(request: unknown): ActorContext { const input = request as { params?: { workspaceId?: string }; session?: { userId?: string } }; if (!input.params?.workspaceId || !input.session?.userId) { const error = new Error("Workspace authentication required"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; } return { workspaceId: input.params.workspaceId, userId: input.session.userId }; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const workspaceMembersRoutes: FastifyPluginAsync<Options> = async (app, { useCases }) => {
  app.get("/api/v1/workspaces/:workspaceId/members", { config: { operationId: "listWorkspaceMembers", roles: ["OWNER", "ADMIN"] } }, async (request) => ({ data: await useCases.listMembers(actor(request)) }));
  app.post("/api/v1/workspaces/:workspaceId/members", { config: { operationId: "inviteWorkspaceMember", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const input = body(request); const member = await useCases.inviteMember(actor(request), { userId: String(input.userId), roleCode: String(input.roleCode) as WorkspaceRole }); return reply.code(201).send({ data: member }); });
  app.patch("/api/v1/workspaces/:workspaceId/members/:memberId", { config: { operationId: "updateWorkspaceMember", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const input = request as { params: { workspaceId: string; memberId: string } }; const data = body(request); const member = await useCases.updateMemberRole(actor(request), input.params.memberId, String(data.roleCode) as WorkspaceRole); reply.header("ETag", etagForRevision(1)); return { data: member }; });
  app.delete("/api/v1/workspaces/:workspaceId/members/:memberId", { config: { operationId: "removeWorkspaceMember", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const input = request as { params: { workspaceId: string; memberId: string } }; await useCases.removeMember(actor(request), input.params.memberId); return reply.code(204).send(); });
};
