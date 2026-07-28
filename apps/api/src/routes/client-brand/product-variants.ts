import type { FastifyPluginAsync } from "fastify";
import type { ProductUseCases } from "../../../../../packages/core/src/modules/client-brand/product-use-cases.js";
import { revisionFromEtag } from "../../concurrency/etag.js";

interface Options { readonly products: ProductUseCases }
function params(request: unknown): { workspaceId: string; productId?: string; variantId?: string } { return (request as { params: { workspaceId: string; productId?: string; variantId?: string } }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }
function expected(request: unknown): number | undefined { const value = (request as { headers?: { "if-match"?: string } }).headers?.["if-match"]; return value ? revisionFromEtag(value) : undefined; }

export const productVariantRoutes: FastifyPluginAsync<Options> = async (app, { products }) => {
  app.get("/api/v1/workspaces/:workspaceId/products/:productId/variants", { config: { operationId: "listProductVariants" } }, async (request) => { const input = params(request); return { data: await products.listVariants(input.workspaceId, input.productId!) }; });
  app.post("/api/v1/workspaces/:workspaceId/products/:productId/variants", { config: { operationId: "createProductVariant", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); const value = body(request); return reply.code(201).send({ data: await products.createVariant({ workspaceId: input.workspaceId, productId: input.productId!, name: String(value.name), ...(value.sku ? { sku: String(value.sku) } : {}), attributes: typeof value.attributes === "object" && value.attributes ? value.attributes as Record<string, unknown> : {} }) }); });
  app.patch("/api/v1/workspaces/:workspaceId/product-variants/:variantId", { config: { operationId: "updateProductVariant", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const input = params(request); return { data: await products.updateVariant(input.workspaceId, input.variantId!, body(request) as never, expected(request)) }; });
  app.delete("/api/v1/workspaces/:workspaceId/product-variants/:variantId", { config: { operationId: "archiveProductVariant", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const input = params(request); await products.archiveVariant(input.workspaceId, input.variantId!, expected(request)); return reply.code(204).send(); });
};
