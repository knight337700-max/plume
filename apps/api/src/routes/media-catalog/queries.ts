import type { FastifyPluginAsync } from "fastify";
import { createCatalogQueryUseCases, type CatalogQueryUseCases } from "../../../../../packages/core/src/modules/media-catalog/query-use-cases.js";
import { isCanonicalChannelCode, type CanonicalChannelCode } from "../../../../../packages/core/src/modules/media-catalog/canonical-catalog.js";
interface Options { readonly queries: CatalogQueryUseCases }
function params(request: unknown): { workspaceId: string; channelId?: string; formatProfileId?: string } { return (request as { params: { workspaceId: string; channelId?: string; formatProfileId?: string } }).params; }
function query(request: unknown): { channel?: string; effectiveDate?: string } { return ((request as { query?: unknown }).query ?? {}) as { channel?: string; effectiveDate?: string }; }
function invalidChannel(): Error { const error = new Error("Unknown catalog channel"); Object.assign(error, { code: "CATALOG_CHANNEL_INVALID", statusCode: 422 }); return error; }
export const catalogQueryRoutes: FastifyPluginAsync<Options> = async (app, { queries }) => {
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/channels", { config: { operationId: "listCatalogChannels" } }, async () => {
    const channels = await queries.listChannels();
    const data = await Promise.all(channels.map(async (channel) => {
      const formats = await queries.listProfiles(channel.code);
      return { ...channel, catalogStatus: formats.length > 0 ? "READY" : "CATALOG_NOT_READY", productsOrFormats: formats };
    }));
    return { data };
  });
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/channels/:channelId", { config: { operationId: "getCatalogChannel" } }, async (request, reply) => { const item = await queries.listChannels().then((items) => items.find((value) => value.id === params(request).channelId || value.code === params(request).channelId)); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); return { data: item }; });
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/format-profiles", { config: { operationId: "listFormatProfiles" } }, async (request) => { const input = query(request); if (input.channel !== undefined && !isCanonicalChannelCode(input.channel)) throw invalidChannel(); return { data: await queries.listProfiles(input.channel as CanonicalChannelCode | undefined, input.effectiveDate) }; });
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/format-profiles/:formatProfileId", { config: { operationId: "getFormatProfile" } }, async (request, reply) => { const item = await queries.getProfile(params(request).formatProfileId!); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); return { data: item }; });
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/format-profiles/:formatProfileId/validation-bundle", { config: { operationId: "getValidationBundle" } }, async (request, reply) => { const item = await queries.getValidationBundle(params(request).formatProfileId!); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); return { data: item }; });
  app.get("/api/v1/workspaces/:workspaceId/media-catalog/format-profiles/:formatProfileId/export-recipe", { config: { operationId: "getFormatExportRecipe" } }, async (request, reply) => { const item = await queries.getExportRecipe(params(request).formatProfileId!); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); return { data: item }; });
};
