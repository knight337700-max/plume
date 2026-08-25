import type { FastifyPluginAsync } from "fastify";
import { hasRequiredRole } from "../auth/policies.js";
import type { WorkspaceRole } from "../auth/workspace-membership.js";

interface RequestWithAuth {
  workspaceMembership?: { role: WorkspaceRole };
  routeOptions?: { config?: { roles?: readonly WorkspaceRole[] } };
}

function permissionDenied(): Error {
  const error = new Error("Role does not permit this operation");
  Object.assign(error, { code: "ROLE_PERMISSION_DENIED", statusCode: 403 });
  return error;
}

export const authorizationPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request) => {
    const input = request as unknown as RequestWithAuth;
    const roles = input.routeOptions?.config?.roles;
    if (!roles || roles.length === 0) return;
    if (!input.workspaceMembership) {
      const error = new Error("Authentication required");
      Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
      throw error;
    }
    if (!hasRequiredRole(input.workspaceMembership?.role, roles)) throw permissionDenied();
  });
};

export { permissionDenied };
