import type { FastifyPluginAsync } from "fastify";
import type { CreativeUseCases } from "../../../../../packages/core/src/modules/creative/creative-use-cases.js";
import type { CreativeRenderArtifactDownloadService } from "../../../../../packages/infrastructure/src/db/creative-render-download.js";

interface Params {
  readonly workspaceId: string;
  readonly versionId: string;
}
interface DownloadParams extends Params {
  readonly renderId: string;
}
interface RequestLike {
  readonly params: Params;
  readonly query?: Record<string, unknown>;
}
export interface CreativeRenderRouteOptions {
  readonly useCases: CreativeUseCases;
  readonly artifactDownloads?: CreativeRenderArtifactDownloadService;
}

export const creativeRenderRoutes: FastifyPluginAsync<CreativeRenderRouteOptions> = async (
  app,
  { useCases, artifactDownloads },
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
  if (artifactDownloads)
    app.get(
      "/api/v1/workspaces/:workspaceId/creative-versions/:versionId/renders/:renderId/download-url",
      {
        config: {
          operationId: "getCreativeRenderDownloadUrl",
          roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"],
        },
      },
      async (request, reply) => {
        const input = (request as { params: DownloadParams }).params;
        try {
          return {
            data: await artifactDownloads.getDownloadUrl({
              workspaceId: input.workspaceId,
              versionId: input.versionId,
              renderId: input.renderId,
            }),
          };
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
          return reply.code(statusCode).send({
            code: (error as { code?: string }).code ?? "INTERNAL_ERROR",
            message: (error as Error).message,
          });
        }
      },
    );
};
