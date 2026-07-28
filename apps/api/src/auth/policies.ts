import type { WorkspaceRole } from "./workspace-membership.js";

export const WORKSPACE_ROLES = Object.freeze([
  "OWNER",
  "ADMIN",
  "EDITOR",
  "REVIEWER",
  "VIEWER",
] as const);

export function hasRequiredRole(
  actual: WorkspaceRole | undefined,
  allowed: readonly WorkspaceRole[],
): boolean {
  return Boolean(actual && allowed.includes(actual));
}

export function assertSelfApprovalAllowed(
  selfApprovalAllowed: boolean,
  actorId: string,
  ownerId: string,
): void {
  if (!selfApprovalAllowed && actorId === ownerId) {
    const error = new Error("Self approval is not allowed by workspace policy");
    Object.assign(error, { code: "DOMAIN_POLICY_DENIED", statusCode: 422 });
    throw error;
  }
}

export function assertCreativeVersionMutable(frozenAt: Date | null | undefined): void {
  if (frozenAt) {
    const error = new Error("Creative version is frozen");
    Object.assign(error, { code: "CREATIVE_VERSION_FROZEN", statusCode: 422 });
    throw error;
  }
}
