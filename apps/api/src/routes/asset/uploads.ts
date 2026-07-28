import type { FastifyPluginAsync } from "fastify";
import type { UploadUseCases } from "../../../../../packages/core/src/modules/asset/upload-use-cases.js";

interface Options { readonly uploads: UploadUseCases }
interface Params { readonly workspaceId: string; readonly uploadId?: string }
function params(request: unknown): Params { return (request as { params: Params }).params; }
function body(request: unknown): Record<string, unknown> { return ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>; }

export const uploadRoutes: FastifyPluginAsync<Options> = async (app, { uploads }) => {
  app.post("/api/v1/workspaces/:workspaceId/uploads", { config: { operationId: "createUploadSession", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => {
    const input = body(request);
    const value = await uploads.create({ workspaceId: params(request).workspaceId, filename: String(input.filename), mimeType: String(input.mimeType), bytes: Number(input.bytes), ...(input.checksumSha256 ? { checksumSha256: String(input.checksumSha256) } : {}), purpose: String(input.purpose) as never, multipartPreferred: Boolean(input.multipartPreferred) });
    return reply.code(201).send(value);
  });
  app.get("/api/v1/workspaces/:workspaceId/uploads/:uploadId", { config: { operationId: "getUploadSession", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => ({ data: await uploads.get(params(request).workspaceId, params(request).uploadId!) }));
  app.post("/api/v1/workspaces/:workspaceId/uploads/:uploadId/parts", { config: { operationId: "createUploadParts", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { const value = body(request); const parts = Array.isArray(value.partNumbers) ? value.partNumbers.map(Number) : []; return reply.code(201).send(await uploads.createParts(params(request).workspaceId, params(request).uploadId!, parts)); });
  app.post("/api/v1/workspaces/:workspaceId/uploads/:uploadId.complete", { config: { operationId: "completeUpload", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request) => { const value = body(request); const parts = Array.isArray(value.parts) ? value.parts as { partNumber: number; etag: string }[] : undefined; return { data: await uploads.complete({ workspaceId: params(request).workspaceId, uploadId: params(request).uploadId!, checksumSha256: String(value.checksumSha256), ...(parts ? { parts } : {}) }) }; });
  app.post("/api/v1/workspaces/:workspaceId/uploads/:uploadId.abort", { config: { operationId: "abortUpload", roles: ["OWNER", "ADMIN", "EDITOR"] } }, async (request, reply) => { await uploads.abort(params(request).workspaceId, params(request).uploadId!); return reply.code(204).send(); });
};
