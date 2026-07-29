import { useMemo, type ReactNode } from "react";
import { useAuth, type AuthStatus } from "./auth-provider.js";
import { useWorkspace, type WorkspaceLoadStatus, type WorkspaceRole } from "./workspace-provider.js";

export type PermissionAction =
  | "workspace.read"
  | "workspace.manage"
  | "campaign.read"
  | "campaign.write"
  | "creative.edit"
  | "creative.review"
  | "creative.approve"
  | "export.create"
  | "catalog.manage"
  | "jobs.manage"
  | "settings.manage";

const allRoles: readonly WorkspaceRole[] = ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"];
const rolePermissions: Readonly<Record<WorkspaceRole, readonly PermissionAction[]>> = {
  OWNER: [
    "workspace.read", "workspace.manage", "campaign.read", "campaign.write", "creative.edit",
    "creative.review", "creative.approve", "export.create", "catalog.manage", "jobs.manage", "settings.manage",
  ],
  ADMIN: [
    "workspace.read", "workspace.manage", "campaign.read", "campaign.write", "creative.edit",
    "creative.review", "creative.approve", "export.create", "catalog.manage", "jobs.manage", "settings.manage",
  ],
  EDITOR: ["workspace.read", "campaign.read", "campaign.write", "creative.edit", "export.create"],
  REVIEWER: ["workspace.read", "campaign.read", "creative.review", "creative.approve"],
  VIEWER: ["workspace.read", "campaign.read"],
};

export function canRolePerform(role: WorkspaceRole | undefined, action: PermissionAction) {
  return role ? rolePermissions[role].includes(action) : false;
}

export function hasRole(role: WorkspaceRole | undefined, required: readonly WorkspaceRole[]) {
  return role !== undefined && required.includes(role);
}

export interface RouteAccessInput {
  authStatus: AuthStatus;
  workspaceStatus: WorkspaceLoadStatus;
  role?: WorkspaceRole;
  requiredPermission?: PermissionAction;
  requiredRoles?: readonly WorkspaceRole[];
}

export type RouteAccess = "loading" | "unauthenticated" | "not-found" | "no-access" | "allowed";

export function evaluateRouteAccess({
  authStatus,
  workspaceStatus,
  role,
  requiredPermission,
  requiredRoles,
}: RouteAccessInput): RouteAccess {
  if (authStatus === "loading" || workspaceStatus === "loading" || workspaceStatus === "idle") return "loading";
  if (authStatus === "unauthenticated" || authStatus === "error") return "unauthenticated";
  if (workspaceStatus === "not-found") return "not-found";
  if (workspaceStatus === "no-access" || workspaceStatus === "error") return "no-access";
  if (requiredPermission && !canRolePerform(role, requiredPermission)) return "no-access";
  if (requiredRoles && requiredRoles.length > 0 && !hasRole(role, requiredRoles)) return "no-access";
  return "allowed";
}

export function useCan(action: PermissionAction) {
  const { role } = useWorkspace();
  return useMemo(() => canRolePerform(role, action), [action, role]);
}

function GuardState({ kind }: { kind: Exclude<RouteAccess, "allowed"> }) {
  const content = {
    loading: { title: "Loading workspace", description: "Preparing your workspace." },
    unauthenticated: { title: "Sign in required", description: "Sign in to access this workspace." },
    "not-found": { title: "Workspace not found", description: "This workspace or resource does not exist." },
    "no-access": { title: "Access unavailable", description: "Your role does not permit this action." },
  }[kind];
  return (
    <section aria-labelledby={`guard-${kind}`} data-guard-state={kind}>
      <h1 id={`guard-${kind}`}>{content.title}</h1>
      <p>{content.description}</p>
    </section>
  );
}

export interface AuthGuardProps { children: ReactNode }

export function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useAuth();
  const access = evaluateRouteAccess({ authStatus: status, workspaceStatus: "ready" });
  return access === "allowed" ? children : <GuardState kind={access} />;
}

export interface WorkspaceGuardProps {
  children: ReactNode;
  requiredPermission?: PermissionAction;
  requiredRoles?: readonly WorkspaceRole[];
}

export function WorkspaceGuard({ children, requiredPermission, requiredRoles }: WorkspaceGuardProps) {
  const { status: authStatus } = useAuth();
  const { status: workspaceStatus, role } = useWorkspace();
  const access = evaluateRouteAccess({
    authStatus,
    workspaceStatus,
    ...(role ? { role } : {}),
    ...(requiredPermission ? { requiredPermission } : {}),
    ...(requiredRoles ? { requiredRoles } : {}),
  });
  return access === "allowed" ? children : <GuardState kind={access} />;
}

export function ProtectedRoute({ children, requiredPermission, requiredRoles }: WorkspaceGuardProps) {
  return (
    <AuthGuard>
      <WorkspaceGuard
        {...(requiredPermission ? { requiredPermission } : {})}
        {...(requiredRoles ? { requiredRoles } : {})}
      >
        {children}
      </WorkspaceGuard>
    </AuthGuard>
  );
}

export { allRoles as WORKSPACE_ROLES };
