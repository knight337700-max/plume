import type { Sql } from "postgres";
import { createInMemoryCatalogRepository, type CatalogRepository, type CatalogSeed } from "../../../core/src/modules/media-catalog/repositories.js";
export class DrizzleMediaCatalogRepositories implements CatalogRepository {
  private readonly delegate: CatalogRepository;
  constructor(_sql: Sql, seed: CatalogSeed = {}) { this.delegate = createInMemoryCatalogRepository(seed); }
  listChannels(...args: Parameters<CatalogRepository["listChannels"]>) { return this.delegate.listChannels(...args); }
  getChannel(...args: Parameters<CatalogRepository["getChannel"]>) { return this.delegate.getChannel(...args); }
  listFormatProfiles(...args: Parameters<CatalogRepository["listFormatProfiles"]>) { return this.delegate.listFormatProfiles(...args); }
  getFormatProfile(...args: Parameters<CatalogRepository["getFormatProfile"]>) { return this.delegate.getFormatProfile(...args); }
  getFormatProfileByKey(...args: Parameters<CatalogRepository["getFormatProfileByKey"]>) { return this.delegate.getFormatProfileByKey(...args); }
  insertChannel(...args: Parameters<CatalogRepository["insertChannel"]>) { return this.delegate.insertChannel(...args); }
  insertFormatProfile(...args: Parameters<CatalogRepository["insertFormatProfile"]>) { return this.delegate.insertFormatProfile(...args); }
  updateFormatProfileStatus(...args: Parameters<CatalogRepository["updateFormatProfileStatus"]>) { return this.delegate.updateFormatProfileStatus(...args); }
}
