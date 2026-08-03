import type { FastifyPluginAsync } from "fastify";
import { createCatalogQueryUseCases } from "../../../../../packages/core/src/modules/media-catalog/query-use-cases.js";
import { createCatalogAdminUseCases } from "../../../../../packages/core/src/modules/media-catalog/admin-use-cases.js";
import { createCanonicalCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";
import { catalogQueryRoutes } from "./queries.js";
import { catalogAdminRoutes } from "./admin.js";
export const mediaCatalogQueryRoutes: FastifyPluginAsync = async (app) => { await app.register(catalogQueryRoutes, { queries: createCatalogQueryUseCases(createCanonicalCatalogRepository()) }); };
export const mediaCatalogRoutes: FastifyPluginAsync = async (app) => { const repository = createCanonicalCatalogRepository(); await app.register(catalogQueryRoutes, { queries: createCatalogQueryUseCases(repository) }); await app.register(catalogAdminRoutes, { admin: createCatalogAdminUseCases(repository) }); };
