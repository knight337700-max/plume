import type { FastifyPluginAsync } from "fastify";
import type { CreativeUseCases } from "../../../../../packages/core/src/modules/creative/creative-use-cases.js";

interface Params {
  readonly workspaceId: string;
  readonly versionId: string;
}
interface RequestLike {
  readonly params: Params;
  readonly query?: Record<string, unknown>;
}
export interface CreativeRenderRouteOptions {
  readonly useCases: CreativeUseCases;
}

export const creativeRenderRoutes: FastifyPluginAsync<CreativeRenderRouteOptions> = async (
  app,
  { useCases },
) => {
  app.get(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId/renders",
    { config: { operationId: "listCreativeRenders" } },
    async (request, reply) => {
      const input = (request as RequestLike).params;
      const renders = await useCases.listRenders(input.workspaceId, input.versionId);
      const query = (request as RequestLike).query ?? {};
      const limitValue = Number(query.limit ?? 50);
      const limit = Number.isFinite(limitValue)
        ? Math.max(1, Math.min(100, Math.floor(limitValue)))
        : 50;
      reply.header("Cache-Control", "private, no-store");
      return { items: renders.slice(0, limit), page: { limit, nextCursor: null } };
    },
  );
};
