import type { FastifyPluginAsync } from "fastify";
import { createCatalogQueryUseCases } from "../../../../../packages/core/src/modules/media-catalog/query-use-cases.js";
import { createCatalogAdminUseCases } from "../../../../../packages/core/src/modules/media-catalog/admin-use-cases.js";
import { createInMemoryCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";
import { catalogQueryRoutes } from "./queries.js";
import { catalogAdminRoutes } from "./admin.js";
export const mediaCatalogQueryRoutes: FastifyPluginAsync = async (app) => { await app.register(catalogQueryRoutes, { queries: createCatalogQueryUseCases(createInMemoryCatalogRepository()) }); };
export const mediaCatalogRoutes: FastifyPluginAsync = async (app) => { const repository = createInMemoryCatalogRepository(); await app.register(catalogQueryRoutes, { queries: createCatalogQueryUseCases(repository) }); await app.register(catalogAdminRoutes, { admin: createCatalogAdminUseCases(repository) }); };
