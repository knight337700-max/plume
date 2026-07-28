import type { FastifyPluginAsync } from "fastify";
import type { SessionUseCases } from "../../../../../packages/core/src/modules/iam/session-use-cases.js";

export interface ListWorkspaceRouteOptions { readonly sessions: SessionUseCases }

function userIdFromRequest(request: unknown): string {
  const session = (request as { session?: { userId?: string } }).session;
  if (!session?.userId) {
    const error = new Error("Authentication required");
    Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
    throw error;
  }
  return session.userId;
}

export const listWorkspacesRoute: FastifyPluginAsync<ListWorkspaceRouteOptions> = async (app, options) => {
  app.get("/api/v1/workspaces", { config: { operationId: "listMyWorkspaces" } }, async (request) => ({
    data: await options.sessions.listWorkspaces(userIdFromRequest(request)),
  }));
};
