import type { FastifyPluginAsync } from "fastify";
import { createDeterministicUploadStorage, createUploadUseCases, type UploadUseCases } from "../../../../../packages/core/src/modules/asset/upload-use-cases.js";
import { fileRoutes } from "./files.js";
import { uploadRoutes } from "./uploads.js";

interface Options { readonly uploads?: UploadUseCases }
export const assetFileRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const uploads = options.uploads ?? createUploadUseCases({ storage: createDeterministicUploadStorage(), bucket: "private" });
  await app.register(uploadRoutes, { uploads });
  await app.register(fileRoutes, { uploads });
};
