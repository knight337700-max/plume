import type { FastifyPluginAsync } from "fastify";
import type { CampaignUseCases } from "../../../../../packages/core/src/modules/campaign/campaign-use-cases.js";
import { etagForRevision, revisionFromEtag } from "../../concurrency/etag.js";

interface Options { readonly campaigns: CampaignUseCases }
interface Params { readonly workspaceId: string; readonly brandId?: string; readonly campaignId?: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }
function expected(request: unknown): number | undefined { const value = (request as { headers?: { "if-match"?: string } }).headers?.["if-match"]; return value ? revisionFromEtag(value) : undefined; }

export const campaignRoutes: FastifyPluginAsync<Options> = async (app, { campaigns }) => {
  app.get("/api/v1/workspaces/:workspaceId/brands/:brandId/campaigns", { config: { operationId: "listBrandCampaigns" } }, async (request) => { const input = params(request); return { items: await campaigns.list(input.workspaceId, input.brandId) }; });
  app.post("/api/v1/workspaces/:workspaceId/brands/:brandId/campaigns", { config: { operationId: "createCampaign", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const value = body(request); const item = await campaigns.create({ workspaceId: input.workspaceId, brandId: input.brandId!, displayCode: String(value.displayCode ?? ""), name: String(value.name), objectiveCode: String(value.objectiveCode ?? "GENERAL"), ...(value.startDate ? { startDate: String(value.startDate) } : {}), ...(value.endDate ? { endDate: String(value.endDate) } : {}), ...(value.landingUrl ? { landingUrl: String(value.landingUrl) } : {}), ...(value.ownerUserId ? { ownerUserId: String(value.ownerUserId) } : {}) }); reply.header("ETag", etagForRevision(item.revisionNo)); return reply.code(201).send({ data: item }); });
  app.get("/api/v1/workspaces/:workspaceId/campaigns", { config: { operationId: "listCampaigns" } }, async (request) => ({ items: await campaigns.list(params(request).workspaceId) }));
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId", { config: { operationId: "getCampaign" } }, async (request, reply) => { const input = params(request); const item = await campaigns.get(input.workspaceId, input.campaignId!); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); reply.header("ETag", etagForRevision(item.revisionNo)); return { data: item }; });
  app.patch("/api/v1/workspaces/:workspaceId/campaigns/:campaignId", { config: { operationId: "updateCampaign", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const item = await campaigns.update(input.workspaceId, input.campaignId!, body(request) as never, expected(request)); reply.header("ETag", etagForRevision(item.revisionNo)); return { data: item }; });
  app.delete("/api/v1/workspaces/:workspaceId/campaigns/:campaignId", { config: { operationId: "archiveCampaign", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); await campaigns.archive(input.workspaceId, input.campaignId!, expected(request)); return reply.code(204).send(); });
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/workflow", { config: { operationId: "getCampaignWorkflow" } }, async (request) => ({ data: await campaigns.workflow(params(request).workspaceId, params(request).campaignId!) }));
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/activity", { config: { operationId: "listCampaignActivity" } }, async (request) => ({ items: await campaigns.activity(params(request).workspaceId, params(request).campaignId!) }));
};
