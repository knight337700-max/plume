import type { FastifyPluginAsync } from "fastify";
import type { UploadUseCases } from "../../../../../packages/core/src/modules/asset/upload-use-cases.js";

interface Options { readonly uploads: UploadUseCases }
export const fileRoutes: FastifyPluginAsync<Options> = async (app, { uploads }) => {
  app.get("/api/v1/workspaces/:workspaceId/files/:fileId/download-url", { config: { operationId: "getFileDownloadUrl", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"] } }, async (request) => { const input = (request as { params: { workspaceId: string; fileId: string } }).params; return { data: await uploads.getDownloadUrl(input.workspaceId, input.fileId) }; });
};
