import type { FastifyPluginAsync } from "fastify";
import type { AdvertiserUseCases } from "../../../../../packages/core/src/modules/client-brand/advertiser-use-cases.js";
import { etagForRevision } from "../../concurrency/etag.js";
import { revisionFromEtag } from "../../concurrency/etag.js";

interface Options { readonly advertisers: AdvertiserUseCases }
function params(request: unknown): { workspaceId: string; advertiserId?: string } { return (request as { params: { workspaceId: string; advertiserId?: string } }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }
function expectedRevision(request: unknown): number | undefined { const header = (request as { headers?: { "if-match"?: string } }).headers?.["if-match"]; return header ? revisionFromEtag(header) : undefined; }

export const advertiserRoutes: FastifyPluginAsync<Options> = async (app, { advertisers }) => {
  app.get("/api/v1/workspaces/:workspaceId/advertisers", { config: { operationId: "listAdvertisers" } }, async (request) => ({ data: await advertisers.list(params(request).workspaceId) }));
  app.post("/api/v1/workspaces/:workspaceId/advertisers", { config: { operationId: "createAdvertiser", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => reply.code(201).send({ data: await advertisers.create(params(request).workspaceId, { name: String(body(request).name), ...(body(request).ownerUserId ? { ownerUserId: String(body(request).ownerUserId) } : {}) }) }));
  app.get("/api/v1/workspaces/:workspaceId/advertisers/:advertiserId", { config: { operationId: "getAdvertiser" } }, async (request, reply) => { const input = params(request); const item = await advertisers.list(input.workspaceId, true).then((items) => items.find((value) => value.id === input.advertiserId)); if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" }); reply.header("ETag", etagForRevision(item.revisionNo)); return { data: item }; });
  app.patch("/api/v1/workspaces/:workspaceId/advertisers/:advertiserId", { config: { operationId: "updateAdvertiser", roles: ["OWNER", "ADMIN"] } }, async (request) => { const input = params(request); const item = await advertisers.update(input.workspaceId, input.advertiserId!, body(request) as never, expectedRevision(request)); return { data: item, etag: etagForRevision(item.revisionNo) }; });
  app.delete("/api/v1/workspaces/:workspaceId/advertisers/:advertiserId", { config: { operationId: "archiveAdvertiser", roles: ["OWNER", "ADMIN"] } }, async (request, reply) => { const input = params(request); await advertisers.archive(input.workspaceId, input.advertiserId!, expectedRevision(request)); return reply.code(204).send(); });
};
