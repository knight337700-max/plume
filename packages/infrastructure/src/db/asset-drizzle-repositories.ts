import type { Sql } from "postgres";
import { createInMemoryAssetRepositories, type AssetRepositories, type AssetSeed } from "../../../core/src/modules/asset/repositories.js";

/** SQL repository seam. The in-memory delegate keeps the infrastructure contract executable before generated Drizzle tables land. */
export class DrizzleAssetRepositories implements AssetRepositories {
  private readonly delegate: AssetRepositories;
  public constructor(_sql: Sql, seed: AssetSeed = {}) { this.delegate = createInMemoryAssetRepositories(seed); }
  listAssets(...args: Parameters<AssetRepositories["listAssets"]>) { return this.delegate.listAssets(...args); }
  getAsset(...args: Parameters<AssetRepositories["getAsset"]>) { return this.delegate.getAsset(...args); }
  createAsset(...args: Parameters<AssetRepositories["createAsset"]>) { return this.delegate.createAsset(...args); }
  updateAsset(...args: Parameters<AssetRepositories["updateAsset"]>) { return this.delegate.updateAsset(...args); }
  archiveAsset(...args: Parameters<AssetRepositories["archiveAsset"]>) { return this.delegate.archiveAsset(...args); }
  listVersions(...args: Parameters<AssetRepositories["listVersions"]>) { return this.delegate.listVersions(...args); }
  getVersion(...args: Parameters<AssetRepositories["getVersion"]>) { return this.delegate.getVersion(...args); }
  createVersion(...args: Parameters<AssetRepositories["createVersion"]>) { return this.delegate.createVersion(...args); }
  listProductLinks(...args: Parameters<AssetRepositories["listProductLinks"]>) { return this.delegate.listProductLinks(...args); }
  linkProduct(...args: Parameters<AssetRepositories["linkProduct"]>) { return this.delegate.linkProduct(...args); }
  unlinkProduct(...args: Parameters<AssetRepositories["unlinkProduct"]>) { return this.delegate.unlinkProduct(...args); }
}
