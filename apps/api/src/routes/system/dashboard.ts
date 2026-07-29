import type { FastifyInstance } from "fastify";

export async function registerDashboardRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/dashboard", { config: { operationId: "getDashboard" } }, async (request, reply) => {
    const workspaceId = (request as { params: { workspaceId: string } }).params.workspaceId;
    reply.header("ETag", `W/\"dashboard-${workspaceId}\"`);
    return {
      campaigns: { total: 0, active: 0, draft: 0 },
      approvals: { pending: 0, approved: 0, rejected: 0 },
      jobs: { queued: 0, running: 0, failed: 0 },
      exports: { queued: 0, completed: 0, failed: 0 },
      activity: [],
    };
  });
}
