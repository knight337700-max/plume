import type { FastifyPluginAsync } from "fastify";
import type { MembershipStore } from "../auth/workspace-membership.js";

interface WorkspaceRequest {
  params?: { workspaceId?: string };
  session?: { userId?: string };
}

function notFound(): Error {
  const error = new Error("Resource not found");
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

export interface WorkspaceGuardOptions {
  readonly memberships: MembershipStore;
}

export const workspaceGuardPlugin: FastifyPluginAsync<WorkspaceGuardOptions> = async (
  app,
  options,
) => {
  app.addHook("preHandler", async (request) => {
    const input = request as unknown as WorkspaceRequest;
    const workspaceId = input.params?.workspaceId;
    if (!workspaceId) return;
    const userId = input.session?.userId;
    if (!userId) throw notFound();
    const membership = await options.memberships.find(workspaceId, userId);
    if (!membership) throw notFound();
    (request as unknown as { workspaceMembership?: unknown }).workspaceMembership = membership;
  });
};

export { notFound as workspaceNotFound };
