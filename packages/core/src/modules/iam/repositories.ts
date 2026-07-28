import { randomUUID } from "node:crypto";

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";
export type WorkspaceStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface WorkspaceRecord { readonly id: string; readonly name: string; readonly slug: string; readonly status: WorkspaceStatus; readonly revisionNo: number }
export interface UserAccountRecord { readonly id: string; readonly email: string; readonly displayName: string; readonly status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED" }
export interface WorkspaceMemberRecord { readonly id: string; readonly workspaceId: string; readonly userId: string; readonly roleCode: WorkspaceRole; readonly status: MembershipStatus; readonly joinedAt?: Date }
export interface WorkspaceInvitationRecord { readonly id: string; readonly workspaceId: string; readonly email: string; readonly roleCode: WorkspaceRole; readonly tokenHash: string; readonly status: InvitationStatus; readonly expiresAt: Date; readonly invitedBy: string }
export interface WorkspacePolicyRecord { readonly id: string; readonly workspaceId: string; readonly selfApprovalAllowed: boolean; readonly retentionDays?: number; readonly filenamePattern?: string; readonly policyJson: Readonly<Record<string, unknown>>; readonly revisionNo: number }

export interface IamRepositories {
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  listWorkspacesForUser(userId: string): Promise<readonly WorkspaceRecord[]>;
  getMembership(workspaceId: string, userId: string): Promise<WorkspaceMemberRecord | null>;
  listMembers(workspaceId: string): Promise<readonly WorkspaceMemberRecord[]>;
  createMembership(input: Omit<WorkspaceMemberRecord, "id"> & { id?: string }): Promise<WorkspaceMemberRecord>;
  updateMembership(workspaceId: string, memberId: string, patch: Partial<Pick<WorkspaceMemberRecord, "roleCode" | "status">>): Promise<WorkspaceMemberRecord>;
  removeMembership(workspaceId: string, memberId: string, actorUserId: string): Promise<void>;
  createInvitation(input: Omit<WorkspaceInvitationRecord, "id" | "status"> & { id?: string }): Promise<WorkspaceInvitationRecord>;
  getPolicy(workspaceId: string): Promise<WorkspacePolicyRecord | null>;
  upsertPolicy(workspaceId: string, patch: Omit<Partial<WorkspacePolicyRecord>, "workspaceId" | "id" | "revisionNo">): Promise<WorkspacePolicyRecord>;
}

export interface IamRepositorySeed { readonly workspaces?: readonly WorkspaceRecord[]; readonly memberships?: readonly WorkspaceMemberRecord[]; readonly policies?: readonly WorkspacePolicyRecord[] }

function notFound(resource: string): Error { const error = new Error(`${resource} not found`); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }
function forbidden(message: string): Error { const error = new Error(message); Object.assign(error, { code: "DOMAIN_POLICY_DENIED", statusCode: 403 }); return error; }

export function createInMemoryIamRepositories(seed: IamRepositorySeed = {}): IamRepositories {
  const workspaces = new Map((seed.workspaces ?? []).map((item) => [item.id, item]));
  const memberships = new Map((seed.memberships ?? []).map((item) => [item.id, Object.freeze({ ...item })]));
  const policies = new Map((seed.policies ?? []).map((item) => [item.workspaceId, item]));
  function requireWorkspace(workspaceId: string): WorkspaceRecord { const workspace = workspaces.get(workspaceId); if (!workspace || workspace.status !== "ACTIVE") throw notFound("Workspace"); return workspace; }
  return {
    async getWorkspace(workspaceId) { return workspaces.get(workspaceId) ?? null; },
    async listWorkspacesForUser(userId) {
      const ids = new Set([...memberships.values()].filter((item) => item.userId === userId && item.status === "ACTIVE").map((item) => item.workspaceId));
      return [...workspaces.values()].filter((item) => ids.has(item.id) && item.status === "ACTIVE");
    },
    async getMembership(workspaceId, userId) { requireWorkspace(workspaceId); return [...memberships.values()].find((item) => item.workspaceId === workspaceId && item.userId === userId && item.status !== "REMOVED") ?? null; },
    async listMembers(workspaceId) { requireWorkspace(workspaceId); return [...memberships.values()].filter((item) => item.workspaceId === workspaceId && item.status !== "REMOVED"); },
    async createMembership(input) {
      requireWorkspace(input.workspaceId);
      if ([...memberships.values()].some((item) => item.workspaceId === input.workspaceId && item.userId === input.userId)) throw new Error("Workspace membership already exists");
      const member = Object.freeze({ id: input.id ?? randomUUID(), ...input }); memberships.set(member.id, member); return member;
    },
    async updateMembership(workspaceId, memberId, patch) {
      requireWorkspace(workspaceId); const current = memberships.get(memberId);
      if (!current || current.workspaceId !== workspaceId || current.status === "REMOVED") throw notFound("Workspace membership");
      const next = Object.freeze({ ...current, ...patch });
      if (current.roleCode === "OWNER" && next.roleCode !== "OWNER") {
        const owners = [...memberships.values()].filter((item) => item.workspaceId === workspaceId && item.status === "ACTIVE" && item.roleCode === "OWNER");
        if (owners.length <= 1) throw forbidden("The last workspace owner cannot be demoted");
      }
      memberships.set(memberId, next); return next;
    },
    async removeMembership(workspaceId, memberId, actorUserId) {
      const current = memberships.get(memberId); if (!current || current.workspaceId !== workspaceId || current.status === "REMOVED") throw notFound("Workspace membership");
      const owners = [...memberships.values()].filter((item) => item.workspaceId === workspaceId && item.status === "ACTIVE" && item.roleCode === "OWNER");
      if (current.roleCode === "OWNER" && owners.length <= 1) throw forbidden(current.userId === actorUserId ? "The last workspace owner cannot remove themselves" : "The last workspace owner cannot be removed");
      memberships.set(memberId, Object.freeze({ ...current, status: "REMOVED" }));
    },
    async createInvitation(input) { requireWorkspace(input.workspaceId); return Object.freeze({ id: input.id ?? randomUUID(), ...input, status: "PENDING" as const }); },
    async getPolicy(workspaceId) { requireWorkspace(workspaceId); return policies.get(workspaceId) ?? null; },
    async upsertPolicy(workspaceId, patch) {
      requireWorkspace(workspaceId); const current = policies.get(workspaceId);
      const next = Object.freeze({ id: current?.id ?? randomUUID(), workspaceId, selfApprovalAllowed: current?.selfApprovalAllowed ?? false, policyJson: current?.policyJson ?? {}, revisionNo: (current?.revisionNo ?? 0) + 1, ...current, ...patch });
      policies.set(workspaceId, next); return next;
    },
  };
}
