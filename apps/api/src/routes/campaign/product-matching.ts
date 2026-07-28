import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ProductMatchingUseCases } from "../../../../../packages/core/src/modules/campaign/product-matching-use-cases.js";

interface Options { readonly matching: ProductMatchingUseCases }
interface Params { readonly workspaceId: string; readonly campaignId: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const productMatchingRoutes: FastifyPluginAsync<Options> = async (app, { matching }) => {
  app.post("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/product-matching.run", { config: { operationId: "runProductMatching", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const jobId = randomUUID(); const location = `/api/v1/workspaces/${input.workspaceId}/jobs/${jobId}`; reply.header("Operation-Location", location); reply.header("Retry-After", "3"); return reply.code(202).send({ job: { id: jobId, status: "QUEUED" }, links: { self: location } }); });
  app.get("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/product-matching", { config: { operationId: "getProductMatching" } }, async (request) => { const input = params(request); return { data: await matching.get(input.workspaceId, input.campaignId) }; });
  app.put("/api/v1/workspaces/:workspaceId/campaigns/:campaignId/products", { config: { operationId: "confirmCampaignProducts", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); const value = body(request); const items = Array.isArray(value.items) ? value.items as { productId: string; status: "CONFIRMED" | "REJECTED" }[] : []; return { data: await matching.confirm(input.workspaceId, input.campaignId, String(value.briefVersionId), items) }; });
};
