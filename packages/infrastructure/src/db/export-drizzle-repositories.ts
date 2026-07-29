import type { Sql } from "postgres";
import { createInMemoryExportRepositories, type ExportRepositories } from "../../../core/src/modules/export/repositories.js";

/** Repository seam used by the worker until the same contract is wired to a live transaction. */
export class DrizzleExportRepositories implements ExportRepositories {
  private readonly delegate: ExportRepositories;
  public constructor(_sql: Sql) { this.delegate = createInMemoryExportRepositories(); }
  createJob(...args: Parameters<ExportRepositories["createJob"]>) { return this.delegate.createJob(...args); }
  getJob(...args: Parameters<ExportRepositories["getJob"]>) { return this.delegate.getJob(...args); }
  listJobs(...args: Parameters<ExportRepositories["listJobs"]>) { return this.delegate.listJobs(...args); }
  updateJob(...args: Parameters<ExportRepositories["updateJob"]>) { return this.delegate.updateJob(...args); }
  createItem(...args: Parameters<ExportRepositories["createItem"]>) { return this.delegate.createItem(...args); }
  listItems(...args: Parameters<ExportRepositories["listItems"]>) { return this.delegate.listItems(...args); }
  updateItem(...args: Parameters<ExportRepositories["updateItem"]>) { return this.delegate.updateItem(...args); }
  appendFile(...args: Parameters<ExportRepositories["appendFile"]>) { return this.delegate.appendFile(...args); }
  listFiles(...args: Parameters<ExportRepositories["listFiles"]>) { return this.delegate.listFiles(...args); }
}

