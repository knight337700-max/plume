import type { FastifyPluginAsync } from "fastify";
import { createAdvertiserUseCases } from "../../../../../packages/core/src/modules/client-brand/advertiser-use-cases.js";
import { createBrandUseCases } from "../../../../../packages/core/src/modules/client-brand/brand-use-cases.js";
import { createInMemoryClientBrandRepositories } from "../../../../../packages/core/src/modules/client-brand/repositories.js";
import { advertiserRoutes } from "./advertisers.js";
import { brandRoutes } from "./brands.js";

export const clientBrandRoutes: FastifyPluginAsync = async (app) => {
  const repositories = createInMemoryClientBrandRepositories();
  await app.register(advertiserRoutes, { advertisers: createAdvertiserUseCases(repositories) });
  await app.register(brandRoutes, { brands: createBrandUseCases(repositories) });
};
