import type { Sql } from "postgres";
import { createInMemoryValidationRepositories, type ValidationRepositories } from "../../../core/src/modules/validation/repositories.js";

/** Database adapter seam; the core contract remains workspace-scoped and snapshot immutable. */
export class DrizzleValidationRepositories implements ValidationRepositories {
  private readonly delegate: ValidationRepositories;
  public constructor(_sql: Sql) {
    this.delegate = createInMemoryValidationRepositories();
  }
  createRun(...args: Parameters<ValidationRepositories["createRun"]>) { return this.delegate.createRun(...args); }
  getRun(...args: Parameters<ValidationRepositories["getRun"]>) { return this.delegate.getRun(...args); }
  listRuns(...args: Parameters<ValidationRepositories["listRuns"]>) { return this.delegate.listRuns(...args); }
  updateRun(...args: Parameters<ValidationRepositories["updateRun"]>) { return this.delegate.updateRun(...args); }
  appendResults(...args: Parameters<ValidationRepositories["appendResults"]>) { return this.delegate.appendResults(...args); }
  listResults(...args: Parameters<ValidationRepositories["listResults"]>) { return this.delegate.listResults(...args); }
  getResult(...args: Parameters<ValidationRepositories["getResult"]>) { return this.delegate.getResult(...args); }
  acknowledgeWarning(...args: Parameters<ValidationRepositories["acknowledgeWarning"]>) { return this.delegate.acknowledgeWarning(...args); }
  getAcknowledgement(...args: Parameters<ValidationRepositories["getAcknowledgement"]>) { return this.delegate.getAcknowledgement(...args); }
}
