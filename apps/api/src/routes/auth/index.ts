import type { FastifyPluginAsync } from "fastify";
import { createInMemoryIamRepositories } from "../../../../../packages/core/src/modules/iam/repositories.js";
import { createSessionUseCases, InMemorySessionStore, type SessionUseCases } from "../../../../../packages/core/src/modules/iam/session-use-cases.js";
import { listWorkspacesRoute } from "../workspace/list-workspaces.js";

export interface AuthRouteOptions { readonly sessions?: SessionUseCases }

function defaultSessions(): SessionUseCases {
  return createSessionUseCases(new InMemorySessionStore(), createInMemoryIamRepositories());
}

function sessionIdFromRequest(request: unknown): string | null {
  const value = (request as { session?: { sessionId?: string; id?: string } }).session;
  return value?.sessionId ?? value?.id ?? null;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const sessions = options.sessions ?? defaultSessions();
  app.get("/api/v1/auth/session", { config: { operationId: "getAuthSession" } }, async (request, reply) => {
    const sessionId = sessionIdFromRequest(request);
    const session = sessionId ? await sessions.getCurrentSession(sessionId) : null;
    if (!session) return reply.code(401).send({ type: "about:blank", title: "Unauthorized", status: 401, code: "AUTHENTICATION_REQUIRED", detail: "Authentication required" });
    return { data: session };
  });
  app.post("/api/v1/auth/logout", { config: { operationId: "logout" } }, async (request, reply) => {
    const sessionId = sessionIdFromRequest(request);
    if (sessionId) await sessions.logout(sessionId);
    reply.clearCookie("sessionId", { path: "/" });
    return reply.code(204).send();
  });
  await app.register(listWorkspacesRoute, { sessions });
};
