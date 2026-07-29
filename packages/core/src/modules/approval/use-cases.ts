import type { WorkspaceRole } from "../iam/repositories.js";
import { assertCanApprove, assertCanRequestApproval } from "./approval-policy.js";
import type { ValidationRepositories } from "../validation/repositories.js";
import type { ApprovalRepositories, ApprovalRequestRecord, ApprovalDecisionRecord } from "./repositories.js";

export interface ApprovalUseCases {
  createRequest(input: { readonly workspaceId: string; readonly creativeVersionId: string; readonly validationRunId: string; readonly requestedBy: string; readonly actorRole: WorkspaceRole; readonly selfApprovalAllowed: boolean; readonly assigneeId?: string | null }): Promise<ApprovalRequestRecord>;
  listRequests(workspaceId: string, filter?: { readonly status?: ApprovalRequestRecord["status"]; readonly assigneeId?: string }): Promise<readonly ApprovalRequestRecord[]>;
  getRequest(workspaceId: string, id: string): Promise<ApprovalRequestRecord | null>;
  decide(input: { readonly workspaceId: string; readonly approvalRequestId: string; readonly decision: "APPROVED" | "REJECTED"; readonly actorId: string; readonly actorRole: WorkspaceRole; readonly selfApprovalAllowed: boolean; readonly currentCreativeVersionId: string; readonly comment?: string | null; readonly warningReason?: string | null }): Promise<ApprovalRequestRecord>;
  cancel(input: { readonly workspaceId: string; readonly approvalRequestId: string; readonly actorId: string }): Promise<ApprovalRequestRecord>;
  supersede(input: { readonly workspaceId: string; readonly previousCreativeVersionId: string; readonly supersededBy: string }): Promise<readonly ApprovalRequestRecord[]>;
  listDecisions(workspaceId: string, approvalRequestId: string): Promise<readonly ApprovalDecisionRecord[]>;
}
function notFound(): Error { const error = new Error("Approval request not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }

export function createApprovalUseCases(dependencies: { readonly approvals: ApprovalRepositories; readonly validations: ValidationRepositories; readonly selfApprovalAllowed?: (workspaceId: string) => Promise<boolean> | boolean }): ApprovalUseCases {
  const selfApproval = async (workspaceId: string, explicit: boolean | undefined) => explicit ?? await dependencies.selfApprovalAllowed?.(workspaceId) ?? false;
  return {
    async createRequest(input) {
      const run = await dependencies.validations.getRun(input.workspaceId, input.validationRunId);
      const results = run ? await dependencies.validations.listResults(input.workspaceId, input.validationRunId) : [];
      const acknowledgements = await Promise.all(results.filter((result) => result.severity === "WARNING").map((result) => dependencies.validations.getAcknowledgement(input.workspaceId, result.id)));
      assertCanRequestApproval({ currentCreativeVersionId: input.creativeVersionId, validationRun: run, validationResults: results, warningAcknowledgements: acknowledgements.filter((item): item is NonNullable<typeof item> => item !== null), actorId: input.requestedBy, requesterId: input.requestedBy, actorRole: input.actorRole, selfApprovalAllowed: await selfApproval(input.workspaceId, input.selfApprovalAllowed) });
      return dependencies.approvals.createRequest({ workspaceId: input.workspaceId, creativeVersionId: input.creativeVersionId, validationRunId: input.validationRunId, requestedBy: input.requestedBy, ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }) });
    },
    listRequests: (workspaceId, filter) => dependencies.approvals.listRequests(workspaceId, filter),
    getRequest: (workspaceId, id) => dependencies.approvals.getRequest(workspaceId, id),
    async decide(input) {
      const request = await dependencies.approvals.getRequest(input.workspaceId, input.approvalRequestId);
      if (!request) throw notFound();
      if (request.status !== "PENDING") {
        if ((input.decision === "APPROVED" && request.status === "APPROVED") || (input.decision === "REJECTED" && request.status === "REJECTED")) return request;
        const error = new Error("Approval request is already decided"); Object.assign(error, { code: "STATE_TRANSITION_CONFLICT", statusCode: 409 }); throw error;
      }
      const run = await dependencies.validations.getRun(input.workspaceId, request.validationRunId);
      const results = run ? await dependencies.validations.listResults(input.workspaceId, request.validationRunId) : [];
      const acknowledgements = await Promise.all(results.filter((result) => result.severity === "WARNING").map((result) => dependencies.validations.getAcknowledgement(input.workspaceId, result.id)));
      assertCanApprove({ currentCreativeVersionId: input.currentCreativeVersionId, validationRun: run, validationResults: results, warningAcknowledgements: acknowledgements.filter((item): item is NonNullable<typeof item> => item !== null), requesterId: request.requestedBy, actorId: input.actorId, actorRole: input.actorRole, selfApprovalAllowed: await selfApproval(input.workspaceId, input.selfApprovalAllowed) });
      await dependencies.approvals.appendDecision({ workspaceId: input.workspaceId, approvalRequestId: request.id, decision: input.decision, decidedBy: input.actorId, comment: input.comment ?? null, warningReason: input.warningReason ?? null, validationSnapshotJson: { validationRunId: request.validationRunId, creativeVersionId: request.creativeVersionId, status: run?.status ?? null } });
      return dependencies.approvals.updateRequest(input.workspaceId, request.id, { status: input.decision, resolvedAt: new Date().toISOString(), supersededBy: null });
    },
    async cancel(input) {
      const request = await dependencies.approvals.getRequest(input.workspaceId, input.approvalRequestId);
      if (!request) throw notFound();
      if (request.status !== "PENDING") return request;
      if (request.requestedBy !== input.actorId) { const error = new Error("Only the requester can cancel approval"); Object.assign(error, { code: "DOMAIN_POLICY_DENIED", statusCode: 403 }); throw error; }
      return dependencies.approvals.updateRequest(input.workspaceId, request.id, { status: "CANCELLED", resolvedAt: new Date().toISOString(), supersededBy: null });
    },
    supersede: (input) => dependencies.approvals.supersedePending(input.workspaceId, input.previousCreativeVersionId, input.supersededBy),
    listDecisions: (workspaceId, id) => dependencies.approvals.listDecisions(workspaceId, id),
  };
}
