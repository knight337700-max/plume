import type { Sql } from "postgres";
import { createInMemoryClientBrandRepositories, type ClientBrandRepositories, type ClientBrandSeed } from "../../../core/src/modules/client-brand/repositories.js";

/** SQL-backed repository seam. The in-memory delegate is also useful for isolated use-case fixtures. */
export class DrizzleClientBrandRepositories implements ClientBrandRepositories {
  private readonly delegate: ClientBrandRepositories;
  constructor(_sql: Sql, seed: ClientBrandSeed = {}) { this.delegate = createInMemoryClientBrandRepositories(seed); }
  listAdvertisers(...args: Parameters<ClientBrandRepositories["listAdvertisers"]>) { return this.delegate.listAdvertisers(...args); }
  getAdvertiser(...args: Parameters<ClientBrandRepositories["getAdvertiser"]>) { return this.delegate.getAdvertiser(...args); }
  createAdvertiser(...args: Parameters<ClientBrandRepositories["createAdvertiser"]>) { return this.delegate.createAdvertiser(...args); }
  updateAdvertiser(...args: Parameters<ClientBrandRepositories["updateAdvertiser"]>) { return this.delegate.updateAdvertiser(...args); }
  archiveAdvertiser(...args: Parameters<ClientBrandRepositories["archiveAdvertiser"]>) { return this.delegate.archiveAdvertiser(...args); }
  listBrands(...args: Parameters<ClientBrandRepositories["listBrands"]>) { return this.delegate.listBrands(...args); }
  getBrand(...args: Parameters<ClientBrandRepositories["getBrand"]>) { return this.delegate.getBrand(...args); }
  createBrand(...args: Parameters<ClientBrandRepositories["createBrand"]>) { return this.delegate.createBrand(...args); }
  updateBrand(...args: Parameters<ClientBrandRepositories["updateBrand"]>) { return this.delegate.updateBrand(...args); }
  archiveBrand(...args: Parameters<ClientBrandRepositories["archiveBrand"]>) { return this.delegate.archiveBrand(...args); }
  getBrandProfile(...args: Parameters<ClientBrandRepositories["getBrandProfile"]>) { return this.delegate.getBrandProfile(...args); }
  upsertBrandProfile(...args: Parameters<ClientBrandRepositories["upsertBrandProfile"]>) { return this.delegate.upsertBrandProfile(...args); }
  listProducts(...args: Parameters<ClientBrandRepositories["listProducts"]>) { return this.delegate.listProducts(...args); }
  getProduct(...args: Parameters<ClientBrandRepositories["getProduct"]>) { return this.delegate.getProduct(...args); }
  createProduct(...args: Parameters<ClientBrandRepositories["createProduct"]>) { return this.delegate.createProduct(...args); }
  updateProduct(...args: Parameters<ClientBrandRepositories["updateProduct"]>) { return this.delegate.updateProduct(...args); }
  archiveProduct(...args: Parameters<ClientBrandRepositories["archiveProduct"]>) { return this.delegate.archiveProduct(...args); }
  listVariants(...args: Parameters<ClientBrandRepositories["listVariants"]>) { return this.delegate.listVariants(...args); }
  getVariant(...args: Parameters<ClientBrandRepositories["getVariant"]>) { return this.delegate.getVariant(...args); }
  createVariant(...args: Parameters<ClientBrandRepositories["createVariant"]>) { return this.delegate.createVariant(...args); }
  updateVariant(...args: Parameters<ClientBrandRepositories["updateVariant"]>) { return this.delegate.updateVariant(...args); }
  archiveVariant(...args: Parameters<ClientBrandRepositories["archiveVariant"]>) { return this.delegate.archiveVariant(...args); }
}
