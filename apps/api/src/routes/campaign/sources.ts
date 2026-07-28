import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { CampaignSourceUseCases } from "../../../../../packages/core/src/modules/campaign/source-use-cases.js";

interface Options { readonly sources: CampaignSourceUseCases }
interface Params { readonly workspaceId: string; readonly campaignId: string; readonly sourceId?: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const campaignSourceRoutes: FastifyPluginAsync<Options> = async (app, { sources }) => {
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/sources", { config: { operationId: "listCampaignSources" } }, async (request) => { const input = params(request); return { items: await sources.list(input.workspaceId, input.campaignId) }; });
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/sources", { config: { operationId: "attachCampaignSource", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const value = body(request); const source = await sources.attach({ workspaceId: input.workspaceId, campaignId: input.campaignId, fileObjectId: String(value.fileObjectId), sourceType: String(value.sourceType ?? "UPLOAD"), ...(value.notes ? { notes: String(value.notes) } : {}), ...(value.uploadedBy ? { uploadedBy: String(value.uploadedBy) } : {}) }); return reply.code(201).send({ data: source }); });
  app.delete("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/sources/:sourceId", { config: { operationId: "removeCampaignSource", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); await sources.remove(input.workspaceId, input.campaignId, input.sourceId!); return reply.code(204).send(); });
};
