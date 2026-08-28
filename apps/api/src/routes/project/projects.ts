import type { FastifyPluginAsync } from "fastify";
import type { ProjectUseCases } from "../../../../../packages/core/src/modules/project/project-use-cases.js";
import { isAssetRoleCode } from "../../../../../packages/core/src/modules/project/asset-role.js";
import type { CreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import { etagForRevision, revisionFromEtag } from "../../concurrency/etag.js";

interface Options {
  readonly projects: ProjectUseCases;
  readonly creatives: Pick<
    CreativeRepositories,
    "listCreativeSetsByProject" | "listAssetUsageGraph"
  >;
}
interface Params {
  workspaceId: string;
  campaignId?: string;
  projectId?: string;
  referenceId?: string;
}
const p = (r: unknown) => (r as { params: Params }).params;
const b = (r: unknown) => ((r as { body?: unknown }).body ?? {}) as Record<string, unknown>;
const revision = (r: unknown) => {
  const value = (r as { headers?: { "if-match"?: string } }).headers?.["if-match"];
  return value ? revisionFromEtag(value) : undefined;
};
const roles = ["OWNER", "ADMIN", "EDITOR"];

export const projectRoutes: FastifyPluginAsync<Options> = async (app, { projects, creatives }) => {
  app.get(
    "/api/v1/workspaces/:workspaceId/campaigns/:campaignId/projects",
    { config: { operationId: "listCampaignProjects" } },
    async (r) => ({ items: await projects.list(p(r).workspaceId, p(r).campaignId!) }),
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/campaigns/:campaignId/projects",
    { config: { operationId: "createProject", roles } },
    async (r, reply) => {
      const value = b(r);
      const item = await projects.create({
        workspaceId: p(r).workspaceId,
        campaignId: p(r).campaignId!,
        name: String(value.name ?? ""),
        ...(value.description === undefined ? {} : { description: String(value.description) }),
      });
      reply.header("ETag", etagForRevision(item.revisionNo));
      return reply.code(201).send({ data: item });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/projects/:projectId",
    { config: { operationId: "getProject" } },
    async (r, reply) => {
      const item = await projects.get(p(r).workspaceId, p(r).projectId!);
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/projects/:projectId",
    { config: { operationId: "updateProject", roles } },
    async (r, reply) => {
      const value = b(r);
      const item = await projects.update(
        p(r).workspaceId,
        p(r).projectId!,
        {
          ...(value.name === undefined ? {} : { name: String(value.name) }),
          ...(value.description === undefined
            ? {}
            : { description: value.description === null ? null : String(value.description) }),
        },
        revision(r),
      );
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/projects/:projectId",
    { config: { operationId: "archiveProject", roles } },
    async (r, reply) => {
      await projects.archive(p(r).workspaceId, p(r).projectId!, revision(r));
      return reply.code(204).send();
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/creative-sets",
    { config: { operationId: "listProjectCreativeSets" } },
    async (r) => ({
      items: await creatives.listCreativeSetsByProject(p(r).workspaceId, p(r).projectId!),
    }),
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/assets",
    { config: { operationId: "listProjectAssets" } },
    async (r) => ({ items: await projects.listAssets(p(r).workspaceId, p(r).projectId!) }),
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/assets",
    { config: { operationId: "addProjectAsset", roles } },
    async (r, reply) => {
      const value = b(r);
      const roleCode = String(value.roleCode ?? "REFERENCE");
      if (!isAssetRoleCode(roleCode)) return reply.code(400).send({ code: "INVALID_ASSET_ROLE" });
      const item = await projects.addAsset({
        workspaceId: p(r).workspaceId,
        projectId: p(r).projectId!,
        assetVersionId: String(value.assetVersionId ?? ""),
        roleCode,
        ...(value.productId === undefined
          ? {}
          : { productId: value.productId === null ? null : String(value.productId) }),
      });
      return reply.code(201).send({ data: item });
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/assets/:referenceId",
    { config: { operationId: "removeProjectAsset", roles } },
    async (r, reply) => {
      await projects.removeAsset(p(r).workspaceId, p(r).projectId!, p(r).referenceId!);
      return reply.code(204).send();
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/assets/effective",
    { config: { operationId: "getEffectiveProjectAssets" } },
    async (r) => ({ items: await projects.effectiveAssets(p(r).workspaceId, p(r).projectId!) }),
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/projects/:projectId/asset-usages",
    { config: { operationId: "listProjectAssetUsages" } },
    async (r) => {
      await projects.get(p(r).workspaceId, p(r).projectId!);
      return {
        items: (await creatives.listAssetUsageGraph(p(r).workspaceId)).filter(
          (item) => item.projectId === p(r).projectId,
        ),
      };
    },
  );
};
