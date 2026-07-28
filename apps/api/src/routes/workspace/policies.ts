import type { FastifyPluginAsync } from "fastify";
import type { ActorContext, WorkspaceUseCases } from "../../../../../packages/core/src/modules/iam/workspace-use-cases.js";
import { etagForRevision } from "../../concurrency/etag.js";
import { assertIfMatch } from "../../concurrency/precondition.js";

interface Options { readonly useCases: WorkspaceUseCases }
function actor(request: unknown): ActorContext { const input = request as { params?: { workspaceId?: string }; session?: { userId?: string } }; if (!input.params?.workspaceId || !input.session?.userId) { const error = new Error("Workspace authentication required"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; } return { workspaceId: input.params.workspaceId, userId: input.session.userId }; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const workspacePoliciesRoutes: FastifyPluginAsync<Options> = async (app, { useCases }) => {
  app.get("/api/v1/workspaces/:workspaceId/policies", { config: { operationId: "getWorkspacePolicy", roles: ["OWNER", "ADMIN"] } }, async (request) => ({ data: await useCases.getPolicy(actor(request)) }));
  app.patch("/api/v1/workspaces/:workspaceId/policies", { config: { operationId: "updateWorkspacePolicy", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const current = await useCases.getPolicy(actor(request)); const header = (request as { headers?: { "if-match"?: string } }).headers?.["if-match"]; assertIfMatch(header, current?.revisionNo ?? 0); const policy = await useCases.updatePolicy(actor(request), body(request) as never); reply.header("ETag", etagForRevision(policy.revisionNo)); return { data: policy }; });
};
