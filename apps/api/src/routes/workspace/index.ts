import type { FastifyPluginAsync } from "fastify";
import { createInMemoryIamRepositories } from "../../../../../packages/core/src/modules/iam/repositories.js";
import { createWorkspaceUseCases, type ActorContext, type WorkspaceUseCases } from "../../../../../packages/core/src/modules/iam/workspace-use-cases.js";
import { etagForRevision } from "../../concurrency/etag.js";
import { workspaceMembersRoutes } from "./members.js";
import { workspacePoliciesRoutes } from "./policies.js";

export interface WorkspaceRouteOptions { readonly useCases?: WorkspaceUseCases }

function actor(request: unknown): ActorContext {
  const input = request as { params?: { workspaceId?: string }; session?: { userId?: string } };
  if (!input.params?.workspaceId || !input.session?.userId) { const error = new Error("Workspace authentication required"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; }
  return { workspaceId: input.params.workspaceId, userId: input.session.userId };
}

function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const workspaceRoutes: FastifyPluginAsync<WorkspaceRouteOptions> = async (app, options) => {
  const useCases = options.useCases ?? createWorkspaceUseCases(createInMemoryIamRepositories());
  app.get("/api/v1/workspaces/:workspaceId", { config: { operationId: "getWorkspace" } }, async (request, reply) => {
    const input = actor(request);
    const workspace = await useCases.getWorkspace(input);
    if (!workspace) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    const value = workspace as { revisionNo?: number };
    if (value.revisionNo) reply.header("ETag", etagForRevision(value.revisionNo));
    return { data: workspace };
  });
  app.patch("/api/v1/workspaces/:workspaceId", { config: { operationId: "updateWorkspace", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => {
    const input = actor(request); const result = await useCases.updateWorkspace(input, body(request) as never); const revision = result.revisionNo;
    reply.header("ETag", etagForRevision(revision)); return { data: result };
  });
  await app.register(workspaceMembersRoutes, { useCases });
  await app.register(workspacePoliciesRoutes, { useCases });
};
