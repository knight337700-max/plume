import type { WorkspaceRole } from "./repositories.js";

export const ROLE_ORDER: Readonly<Record<WorkspaceRole, number>> = Object.freeze({ OWNER: 5, ADMIN: 4, EDITOR: 3, REVIEWER: 2, VIEWER: 1 });
export const MANAGE_MEMBERS_ROLES = Object.freeze(["OWNER", "ADMIN"] as const satisfies readonly WorkspaceRole[]);

export function canManageMembers(role: WorkspaceRole): boolean { return MANAGE_MEMBERS_ROLES.includes(role as (typeof MANAGE_MEMBERS_ROLES)[number]); }
export function canManagePolicy(role: WorkspaceRole): boolean { return canManageMembers(role); }
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (actor === "OWNER") return true;
  return actor === "ADMIN" && target !== "OWNER";
}
export function isRoleEscalation(actor: WorkspaceRole, target: WorkspaceRole): boolean { return ROLE_ORDER[target] > ROLE_ORDER[actor]; }

export function assertCanManageMembers(role: WorkspaceRole): void {
  if (!canManageMembers(role)) { const error = new Error("Only an owner or admin can manage workspace members"); Object.assign(error, { code: "DOMAIN_POLICY_DENIED", statusCode: 403 }); throw error; }
}
export function assertCanAssignRole(actor: WorkspaceRole, target: WorkspaceRole): void {
  assertCanManageMembers(actor);
  if (!canAssignRole(actor, target) || isRoleEscalation(actor, target)) { const error = new Error("Role escalation is not permitted"); Object.assign(error, { code: "DOMAIN_POLICY_DENIED", statusCode: 403 }); throw error; }
}
