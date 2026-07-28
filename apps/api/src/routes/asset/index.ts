import type { FastifyPluginAsync } from "fastify";
import { createDeterministicUploadStorage, createUploadUseCases, type UploadUseCases } from "../../../../../packages/core/src/modules/asset/upload-use-cases.js";
import { createAssetUseCases, type AssetUseCases } from "../../../../../packages/core/src/modules/asset/asset-use-cases.js";
import { createInMemoryAssetRepositories } from "../../../../../packages/core/src/modules/asset/repositories.js";
import { fileRoutes } from "./files.js";
import { uploadRoutes } from "./uploads.js";
import { assetRoutes } from "./assets.js";
import { productAssetLinkRoutes } from "./product-links.js";

interface Options { readonly uploads?: UploadUseCases; readonly assets?: AssetUseCases }
export const assetFileRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const uploads = options.uploads ?? createUploadUseCases({ storage: createDeterministicUploadStorage(), bucket: "private" });
  await app.register(uploadRoutes, { uploads });
  await app.register(fileRoutes, { uploads });
};

export const assetRoutesGroup: FastifyPluginAsync<Options> = async (app, options) => {
  const assets = options.assets ?? createAssetUseCases(createInMemoryAssetRepositories());
  await app.register(assetRoutes, { assets });
  await app.register(productAssetLinkRoutes, { assets });
};
