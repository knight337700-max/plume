import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { CampaignAssetPoolUseCases } from "../../../../../packages/core/src/modules/campaign/asset-pool-use-cases.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";
import { jobTypeNotEnabled } from "../../async/route-policy.js";

interface Options { readonly pool: CampaignAssetPoolUseCases; readonly asyncCommands?: AsyncCommandPublisher }
interface Params { readonly workspaceId: string; readonly campaignId: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const assetPoolRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { pool } = options;
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/assets.recommend", { config: { operationId: "recommendCampaignAssets", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { if (options.asyncCommands) jobTypeNotEnabled("asset.recommend"); const input = params(request); const jobId = randomUUID(); const location = `/api/v1/workspaces/${input.workspaceId}/jobs/${jobId}`; reply.header("Operation-Location", location); reply.header("Retry-After", "3"); return reply.code(202).send({ job: { id: jobId, status: "QUEUED" }, links: { self: location } }); });
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/asset-pool", { config: { operationId: "getCampaignAssetPool" } }, async (request) => { const input = params(request); const productId = (request as { query?: { productId?: string } }).query?.productId; return { data: await pool.get(input.workspaceId, input.campaignId, productId) }; });
  app.put("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/asset-pool", { config: { operationId: "updateCampaignAssetPool", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); const value = body(request); const items = Array.isArray(value.items) ? value.items as { productId: string; assetVersionId: string; status: "SELECTED" | "EXCLUDED"; licenseStatus: string; reason?: string }[] : []; const saved = await Promise.all(items.map((item) => pool.select({ workspaceId: input.workspaceId, campaignId: input.campaignId, ...item }))); return { data: saved }; });
};
