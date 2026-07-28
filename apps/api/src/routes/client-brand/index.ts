import type { FastifyPluginAsync } from "fastify";
import { createAdvertiserUseCases } from "../../../../../packages/core/src/modules/client-brand/advertiser-use-cases.js";
import { createBrandUseCases } from "../../../../../packages/core/src/modules/client-brand/brand-use-cases.js";
import { createInMemoryClientBrandRepositories } from "../../../../../packages/core/src/modules/client-brand/repositories.js";
import { advertiserRoutes } from "./advertisers.js";
import { brandRoutes } from "./brands.js";
import { createProductUseCases } from "../../../../../packages/core/src/modules/client-brand/product-use-cases.js";
import { productRoutes } from "./products.js";
import { productVariantRoutes } from "./product-variants.js";

export const clientBrandRoutes: FastifyPluginAsync = async (app) => {
  const repositories = createInMemoryClientBrandRepositories();
  await app.register(advertiserRoutes, { advertisers: createAdvertiserUseCases(repositories) });
  await app.register(brandRoutes, { brands: createBrandUseCases(repositories) });
  const products = createProductUseCases(repositories);
  await app.register(productRoutes, { products });
  await app.register(productVariantRoutes, { products });
};
