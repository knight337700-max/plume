import type { IamRepositories, WorkspaceMemberRecord, WorkspacePolicyRecord, WorkspaceRecord, WorkspaceRole } from "./repositories.js";
import { assertCanAssignRole, assertCanManageMembers, canManagePolicy } from "./workspace-policies.js";

export interface ActorContext { readonly userId: string; readonly workspaceId: string }
export interface WorkspaceUseCases {
  getWorkspace(actor: ActorContext): Promise<WorkspaceRecord | null>;
  updateWorkspace(actor: ActorContext, patch: Partial<Pick<WorkspaceRecord, "name" | "slug">>): Promise<WorkspaceRecord>;
  listMembers(actor: ActorContext): Promise<readonly WorkspaceMemberRecord[]>;
  inviteMember(actor: ActorContext, input: { readonly userId: string; readonly roleCode: WorkspaceRole }): Promise<WorkspaceMemberRecord>;
  updateMemberRole(actor: ActorContext, memberId: string, roleCode: WorkspaceRole): Promise<WorkspaceMemberRecord>;
  removeMember(actor: ActorContext, memberId: string): Promise<void>;
  getPolicy(actor: ActorContext): Promise<WorkspacePolicyRecord | null>;
  updatePolicy(actor: ActorContext, patch: Omit<Partial<WorkspacePolicyRecord>, "workspaceId" | "id" | "revisionNo">): Promise<WorkspacePolicyRecord>;
}

async function actorMembership(repositories: IamRepositories, actor: ActorContext): Promise<WorkspaceMemberRecord> {
  const membership = await repositories.getMembership(actor.workspaceId, actor.userId);
  if (!membership || membership.status !== "ACTIVE") { const error = new Error("Workspace membership not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; }
  return membership;
}

export function createWorkspaceUseCases(repositories: IamRepositories): WorkspaceUseCases {
  return {
    async getWorkspace(actor) { await actorMembership(repositories, actor); return repositories.getWorkspace(actor.workspaceId); },
    async updateWorkspace(actor, patch) { const member = await actorMembership(repositories, actor); assertCanManageMembers(member.roleCode); return repositories.updateWorkspace(actor.workspaceId, patch); },
    async listMembers(actor) { await actorMembership(repositories, actor); return repositories.listMembers(actor.workspaceId); },
    async inviteMember(actor, input) { const member = await actorMembership(repositories, actor); assertCanAssignRole(member.roleCode, input.roleCode); return repositories.createMembership({ workspaceId: actor.workspaceId, userId: input.userId, roleCode: input.roleCode, status: "INVITED" }); },
    async updateMemberRole(actor, memberId, roleCode) { const manager = await actorMembership(repositories, actor); assertCanAssignRole(manager.roleCode, roleCode); return repositories.updateMembership(actor.workspaceId, memberId, { roleCode }); },
    async removeMember(actor, memberId) { const manager = await actorMembership(repositories, actor); assertCanManageMembers(manager.roleCode); await repositories.removeMembership(actor.workspaceId, memberId, actor.userId); },
    async getPolicy(actor) { await actorMembership(repositories, actor); return repositories.getPolicy(actor.workspaceId); },
    async updatePolicy(actor, patch) { const member = await actorMembership(repositories, actor); if (!canManagePolicy(member.roleCode)) { assertCanManageMembers(member.roleCode); } return repositories.upsertPolicy(actor.workspaceId, patch); },
  };
}
