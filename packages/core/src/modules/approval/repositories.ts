import { randomUUID } from "node:crypto";

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "SUPERSEDED";
export interface ApprovalRequestRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly validationRunId: string;
  readonly stageNo: number;
  readonly requiredApprovals: number;
  readonly status: ApprovalRequestStatus;
  readonly requestedBy: string;
  readonly assigneeId?: string | null;
  readonly requestedAt: string;
  readonly resolvedAt?: string | null;
  readonly supersededBy?: string | null;
}
export interface ApprovalDecisionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly approvalRequestId: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly decidedBy: string;
  readonly comment?: string | null;
  readonly warningReason?: string | null;
  readonly validationSnapshotJson: Readonly<Record<string, unknown>>;
  readonly decidedAt: string;
}
export interface CreateApprovalRequestInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly validationRunId: string;
  readonly requestedBy: string;
  readonly assigneeId?: string | null;
  readonly stageNo?: number;
  readonly requiredApprovals?: number;
}
export interface ApprovalRepositories {
  createRequest(input: CreateApprovalRequestInput): Promise<ApprovalRequestRecord>;
  getRequest(workspaceId: string, id: string): Promise<ApprovalRequestRecord | null>;
  listRequests(workspaceId: string, filter?: { readonly status?: ApprovalRequestStatus; readonly assigneeId?: string }): Promise<readonly ApprovalRequestRecord[]>;
  updateRequest(workspaceId: string, id: string, patch: Pick<ApprovalRequestRecord, "status" | "resolvedAt" | "supersededBy">): Promise<ApprovalRequestRecord>;
  appendDecision(input: Omit<ApprovalDecisionRecord, "id" | "decidedAt"> & { id?: string }): Promise<ApprovalDecisionRecord>;
  listDecisions(workspaceId: string, approvalRequestId: string): Promise<readonly ApprovalDecisionRecord[]>;
  supersedePending(workspaceId: string, previousCreativeVersionId: string, supersededBy: string): Promise<readonly ApprovalRequestRecord[]>;
}
function notFound(): Error { const error = new Error("Approval request not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function createInMemoryApprovalRepositories(seed: { readonly requests?: readonly ApprovalRequestRecord[]; readonly decisions?: readonly ApprovalDecisionRecord[] } = {}): ApprovalRepositories {
  const requests = new Map(seed.requests?.map((item) => [item.id, item]) ?? []);
  const decisions = new Map(seed.decisions?.map((item) => [item.id, item]) ?? []);
  return {
    async createRequest(input) {
      const item: ApprovalRequestRecord = Object.freeze({ id: input.id ?? randomUUID(), workspaceId: input.workspaceId, creativeVersionId: input.creativeVersionId, validationRunId: input.validationRunId, stageNo: input.stageNo ?? 1, requiredApprovals: input.requiredApprovals ?? 1, status: "PENDING", requestedBy: input.requestedBy, ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }), requestedAt: new Date().toISOString(), resolvedAt: null, supersededBy: null });
      requests.set(item.id, item);
      return item;
    },
    async getRequest(workspaceId, id) { const item = requests.get(id); return item?.workspaceId === workspaceId ? item : null; },
    async listRequests(workspaceId, filter = {}) { return [...requests.values()].filter((item) => item.workspaceId === workspaceId && (!filter.status || item.status === filter.status) && (!filter.assigneeId || item.assigneeId === filter.assigneeId)).sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)); },
    async updateRequest(workspaceId, id, patch) {
      const current = requests.get(id);
      if (!current || current.workspaceId !== workspaceId) throw notFound();
      if (current.status !== "PENDING" && patch.status !== current.status) { const error = new Error("Approval request is already decided"); Object.assign(error, { code: "STATE_TRANSITION_CONFLICT", statusCode: 409 }); throw error; }
      const item = Object.freeze({ ...current, ...patch });
      requests.set(id, item);
      return item;
    },
    async appendDecision(input) {
      const request = requests.get(input.approvalRequestId);
      if (!request || request.workspaceId !== input.workspaceId) throw notFound();
      const duplicate = [...decisions.values()].find((item) => item.approvalRequestId === input.approvalRequestId && item.decidedBy === input.decidedBy);
      if (duplicate) return duplicate;
      const item: ApprovalDecisionRecord = Object.freeze({ id: input.id ?? randomUUID(), ...input, validationSnapshotJson: Object.freeze(clone(input.validationSnapshotJson)), decidedAt: new Date().toISOString() });
      decisions.set(item.id, item);
      return item;
    },
    async listDecisions(workspaceId, approvalRequestId) { return [...decisions.values()].filter((item) => item.workspaceId === workspaceId && item.approvalRequestId === approvalRequestId).sort((left, right) => left.decidedAt.localeCompare(right.decidedAt)); },
    async supersedePending(workspaceId, previousCreativeVersionId, supersededBy) {
      const updated: ApprovalRequestRecord[] = [];
      for (const item of requests.values()) if (item.workspaceId === workspaceId && item.creativeVersionId === previousCreativeVersionId && item.status === "PENDING") { const next = Object.freeze({ ...item, status: "SUPERSEDED" as const, supersededBy, resolvedAt: new Date().toISOString() }); requests.set(item.id, next); updated.push(next); }
      return updated;
    },
  };
}
