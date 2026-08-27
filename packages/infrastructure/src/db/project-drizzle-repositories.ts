import type { Sql } from "postgres";
import {
  createInMemoryProjectRepositories,
  type ProjectRepositories,
  type ProjectSeed,
} from "../../../core/src/modules/project/repositories.js";

/** Database adapter seam for the workspace-scoped Project aggregate. */
export class DrizzleProjectRepositories implements ProjectRepositories {
  private readonly delegate: ProjectRepositories;
  public constructor(_sql: Sql, seed: ProjectSeed = {}) {
    this.delegate = createInMemoryProjectRepositories(seed);
  }
  listProjects(...args: Parameters<ProjectRepositories["listProjects"]>) {
    return this.delegate.listProjects(...args);
  }
  getProject(...args: Parameters<ProjectRepositories["getProject"]>) {
    return this.delegate.getProject(...args);
  }
  createProject(...args: Parameters<ProjectRepositories["createProject"]>) {
    return this.delegate.createProject(...args);
  }
  updateProject(...args: Parameters<ProjectRepositories["updateProject"]>) {
    return this.delegate.updateProject(...args);
  }
  archiveProject(...args: Parameters<ProjectRepositories["archiveProject"]>) {
    return this.delegate.archiveProject(...args);
  }
  listAssetReferences(...args: Parameters<ProjectRepositories["listAssetReferences"]>) {
    return this.delegate.listAssetReferences(...args);
  }
  addAssetReference(...args: Parameters<ProjectRepositories["addAssetReference"]>) {
    return this.delegate.addAssetReference(...args);
  }
  removeAssetReference(...args: Parameters<ProjectRepositories["removeAssetReference"]>) {
    return this.delegate.removeAssetReference(...args);
  }
}
