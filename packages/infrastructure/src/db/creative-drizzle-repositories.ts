import type { Sql } from "postgres";
import {
  createInMemoryCreativeRepositories,
  type CreativeRepositories,
  type CreativeSeed,
} from "../../../core/src/modules/creative/repositories.js";

/** Database adapter seam for Creative aggregates; every method delegates through the workspace-scoped core contract. */
export class DrizzleCreativeRepositories implements CreativeRepositories {
  private readonly delegate: CreativeRepositories;

  public constructor(_sql: Sql, seed: CreativeSeed = {}) {
    this.delegate = createInMemoryCreativeRepositories(seed);
  }

  listCreativeSets(...args: Parameters<CreativeRepositories["listCreativeSets"]>) {
    return this.delegate.listCreativeSets(...args);
  }
  getCreativeSet(...args: Parameters<CreativeRepositories["getCreativeSet"]>) {
    return this.delegate.getCreativeSet(...args);
  }
  createCreativeSet(...args: Parameters<CreativeRepositories["createCreativeSet"]>) {
    return this.delegate.createCreativeSet(...args);
  }
  updateCreativeSet(...args: Parameters<CreativeRepositories["updateCreativeSet"]>) {
    return this.delegate.updateCreativeSet(...args);
  }
  archiveCreativeSet(...args: Parameters<CreativeRepositories["archiveCreativeSet"]>) {
    return this.delegate.archiveCreativeSet(...args);
  }
  listCreatives(...args: Parameters<CreativeRepositories["listCreatives"]>) {
    return this.delegate.listCreatives(...args);
  }
  getCreative(...args: Parameters<CreativeRepositories["getCreative"]>) {
    return this.delegate.getCreative(...args);
  }
  createCreative(...args: Parameters<CreativeRepositories["createCreative"]>) {
    return this.delegate.createCreative(...args);
  }
  updateCreative(...args: Parameters<CreativeRepositories["updateCreative"]>) {
    return this.delegate.updateCreative(...args);
  }
  createVersion(...args: Parameters<CreativeRepositories["createVersion"]>) {
    return this.delegate.createVersion(...args);
  }
  listVersions(...args: Parameters<CreativeRepositories["listVersions"]>) {
    return this.delegate.listVersions(...args);
  }
  getVersion(...args: Parameters<CreativeRepositories["getVersion"]>) {
    return this.delegate.getVersion(...args);
  }
  updateDraftVersion(...args: Parameters<CreativeRepositories["updateDraftVersion"]>) {
    return this.delegate.updateDraftVersion(...args);
  }
  freezeVersion(...args: Parameters<CreativeRepositories["freezeVersion"]>) {
    return this.delegate.freezeVersion(...args);
  }
  addAssetUsages(...args: Parameters<CreativeRepositories["addAssetUsages"]>) {
    return this.delegate.addAssetUsages(...args);
  }
  listAssetUsages(...args: Parameters<CreativeRepositories["listAssetUsages"]>) {
    return this.delegate.listAssetUsages(...args);
  }
  appendEditOperations(...args: Parameters<CreativeRepositories["appendEditOperations"]>) {
    return this.delegate.appendEditOperations(...args);
  }
  listEditOperations(...args: Parameters<CreativeRepositories["listEditOperations"]>) {
    return this.delegate.listEditOperations(...args);
  }
  createRender(...args: Parameters<CreativeRepositories["createRender"]>) {
    return this.delegate.createRender(...args);
  }
  listRenders(...args: Parameters<CreativeRepositories["listRenders"]>) {
    return this.delegate.listRenders(...args);
  }
}
