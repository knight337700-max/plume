import type { FastifyPluginAsync } from "fastify";
import { createCatalogQueryUseCases } from "../../../../../packages/core/src/modules/media-catalog/query-use-cases.js";
import { createInMemoryCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";
import { catalogQueryRoutes } from "./queries.js";
export const mediaCatalogQueryRoutes: FastifyPluginAsync = async (app) => { await app.register(catalogQueryRoutes, { queries: createCatalogQueryUseCases(createInMemoryCatalogRepository()) }); };
