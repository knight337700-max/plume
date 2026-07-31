import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { BriefUseCases } from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";
import { jobTypeNotEnabled } from "../../async/route-policy.js";

interface Options { readonly briefs: BriefUseCases; readonly asyncCommands?: AsyncCommandPublisher }
interface Params { readonly workspaceId: string; readonly campaignId: string; readonly versionId?: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const campaignBriefRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { briefs } = options;
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/brief.analyze", { config: { operationId: "analyzeCampaignBrief", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (_request, _reply) => { if (options.asyncCommands) jobTypeNotEnabled("brief.analyze"); const jobId = randomUUID(); const location = `/api/v1/workspaces/${params(_request).workspaceId}/jobs/${jobId}`; _reply.header("Operation-Location", location); _reply.header("Location", `/api/v1/workspaces/${params(_request).workspaceId}/campaigns/${params(_request).campaignId}/brief`); _reply.header("Retry-After", "3"); return _reply.code(202).send({ job: { id: jobId, status: "QUEUED" }, links: { self: location } }); });
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/brief", { config: { operationId: "getCampaignBrief" } }, async (request) => ({ data: await briefs.get(params(request).workspaceId, params(request).campaignId) }));
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/brief/versions", { config: { operationId: "createCampaignBriefVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const value = body(request); const version = await briefs.createVersion({ workspaceId: input.workspaceId, campaignBriefId: input.campaignId, ...(value.parentVersionId ? { parentVersionId: String(value.parentVersionId) } : {}), sourceKind: String(value.sourceKind ?? "MANUAL"), contentJson: typeof value.contentJson === "object" && value.contentJson ? value.contentJson as Record<string, unknown> : {}, sourceCitationsJson: Array.isArray(value.sourceCitationsJson) ? value.sourceCitationsJson : [], brandProfileSnapshotJson: typeof value.brandProfileSnapshotJson === "object" && value.brandProfileSnapshotJson ? value.brandProfileSnapshotJson as Record<string, unknown> : {}, ...(value.createdBy ? { createdBy: String(value.createdBy) } : {}) }); return reply.code(201).send({ data: version }); });
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/brief/versions/:versionId.confirm", { config: { operationId: "confirmCampaignBriefVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); return { data: await briefs.confirm(input.workspaceId, input.versionId!) }; });
};
