import type { FastifyPluginAsync } from "fastify";
import type { AssetUseCases } from "../../../../../packages/core/src/modules/asset/asset-use-cases.js";

interface Options { readonly assets: AssetUseCases }
export const productAssetLinkRoutes: FastifyPluginAsync<Options> = async (app, { assets }) => {
  app.get("/api/v1/workspaces/:workspaceId/products/:productId/assets", { config: { operationId: "listProductAssets" } }, async (request) => { const input = (request as { params: { workspaceId: string; productId: string } }).params; return { items: await assets.listProductLinks(input.workspaceId, input.productId) }; });
  app.post("/api/v1/workspaces/:workspaceId/products/:productId/assets", { config: { operationId: "linkProductAsset", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = (request as { params: { workspaceId: string; productId: string } }).params; const value = ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; const item = await assets.linkProduct({ workspaceId: input.workspaceId, productId: input.productId, assetVersionId: String(value.assetVersionId), isPrimary: Boolean(value.isPrimary), sortOrder: Number(value.sortOrder ?? 0) }); return reply.code(201).send({ data: item }); });
  app.delete("/api/v1/workspaces/:workspaceId/products/:productId/assets/:assetId", { config: { operationId: "unlinkProductAsset", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = (request as { params: { workspaceId: string; productId: string; assetId: string } }).params; await assets.unlinkProduct(input.workspaceId, input.productId, input.assetId); return reply.code(204).send(); });
};
