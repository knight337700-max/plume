import type { FastifyPluginAsync } from "fastify";
import type { BrandUseCases } from "../../../../../packages/core/src/modules/client-brand/brand-use-cases.js";
import { etagForRevision } from "../../concurrency/etag.js";
import { revisionFromEtag } from "../../concurrency/etag.js";

interface Options { readonly brands: BrandUseCases }
function params(request: unknown): { workspaceId: string; advertiserId?: string; brandId?: string } { return (request as { params: { workspaceId: string; advertiserId?: string; brandId?: string } }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }
function expectedRevision(request: unknown): number | undefined { const header = (request as { headers?: { "if-match"?: string } }).headers?.["if-match"]; return header ? revisionFromEtag(header) : undefined; }

export const brandRoutes: FastifyPluginAsync<Options> = async (app, { brands }) => {
  app.get("/api/v1/workspaces/:workspaceId/advertisers/:advertiserId/brands", { config: { operationId: "listBrands" } }, async (request) => { const input = params(request); return { data: await brands.list(input.workspaceId, input.advertiserId!) }; });
  app.post("/api/v1/workspaces/:workspaceId/advertisers/:advertiserId/brands", { config: { operationId: "createBrand", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); return reply.code(201).send({ data: await brands.create(input.workspaceId, input.advertiserId!, { name: String(body(request).name), ...(body(request).logoAssetId ? { logoAssetId: String(body(request).logoAssetId) } : {}) }) }); });
  app.get("/api/v1/workspaces/:workspaceId/brands/:brandId", { config: { operationId: "getBrand" } }, async (request, reply) => { const input = params(request); const item = await brands.get(input.workspaceId, input.brandId!); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); reply.header("ETag", etagForRevision(item.revisionNo)); return { data: item }; });
  app.patch("/api/v1/workspaces/:workspaceId/brands/:brandId", { config: { operationId: "updateBrand", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); const item = await brands.update(input.workspaceId, input.brandId!, body(request) as never, expectedRevision(request)); return { data: item }; });
  app.delete("/api/v1/workspaces/:workspaceId/brands/:brandId", { config: { operationId: "archiveBrand", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const input = params(request); await brands.archive(input.workspaceId, input.brandId!, expectedRevision(request)); return reply.code(204).send(); });
  app.get("/api/v1/workspaces/:workspaceId/brands/:brandId/profile", { config: { operationId: "getBrandProfile" } }, async (request) => { const input = params(request); return { data: await brands.getProfile(input.workspaceId, input.brandId!) }; });
  app.patch("/api/v1/workspaces/:workspaceId/brands/:brandId/profile", { config: { operationId: "updateBrandProfile", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); const profile = await brands.updateProfile(input.workspaceId, input.brandId!, body(request) as never, expectedRevision(request)); return { data: profile }; });
};
