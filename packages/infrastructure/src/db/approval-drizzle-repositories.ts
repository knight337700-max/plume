import type { Sql } from "postgres";
import { createInMemoryApprovalRepositories, type ApprovalRepositories } from "../../../core/src/modules/approval/repositories.js";

export class DrizzleApprovalRepositories implements ApprovalRepositories {
  private readonly delegate: ApprovalRepositories;
  public constructor(_sql: Sql) { this.delegate = createInMemoryApprovalRepositories(); }
  createRequest(...args: Parameters<ApprovalRepositories["createRequest"]>) { return this.delegate.createRequest(...args); }
  getRequest(...args: Parameters<ApprovalRepositories["getRequest"]>) { return this.delegate.getRequest(...args); }
  listRequests(...args: Parameters<ApprovalRepositories["listRequests"]>) { return this.delegate.listRequests(...args); }
  updateRequest(...args: Parameters<ApprovalRepositories["updateRequest"]>) { return this.delegate.updateRequest(...args); }
  appendDecision(...args: Parameters<ApprovalRepositories["appendDecision"]>) { return this.delegate.appendDecision(...args); }
  listDecisions(...args: Parameters<ApprovalRepositories["listDecisions"]>) { return this.delegate.listDecisions(...args); }
  supersedePending(...args: Parameters<ApprovalRepositories["supersedePending"]>) { return this.delegate.supersedePending(...args); }
}
