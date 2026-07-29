import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "./auth-provider.js";
import {
  canRolePerform,
  evaluateRouteAccess,
  ProtectedRoute,
} from "./route-guards.js";
import { WorkspaceProvider } from "./workspace-provider.js";

const session = {
  id: "session-1",
  user: { id: "user-1", email: "user@example.test", displayName: "User" },
  expiresAt: "2026-07-30T00:00:00.000Z",
};

const workspace = {
  id: "ws-1",
  name: "Workspace",
  slug: "workspace",
  status: "ACTIVE" as const,
  revisionNo: 1,
};

describe("route and permission guards", () => {
  it("applies the role matrix to protected actions", () => {
    expect(canRolePerform("EDITOR", "creative.edit")).toBe(true);
    expect(canRolePerform("EDITOR", "creative.approve")).toBe(false);
    expect(canRolePerform("REVIEWER", "creative.approve")).toBe(true);
    expect(canRolePerform("VIEWER", "workspace.manage")).toBe(false);
  });

  it("keeps not-found and no-access as separate route outcomes", () => {
    expect(evaluateRouteAccess({ authStatus: "authenticated", workspaceStatus: "not-found" })).toBe("not-found");
    expect(evaluateRouteAccess({ authStatus: "authenticated", workspaceStatus: "ready", role: "VIEWER", requiredPermission: "creative.edit" })).toBe("no-access");
    expect(evaluateRouteAccess({ authStatus: "authenticated", workspaceStatus: "ready", role: "EDITOR", requiredPermission: "creative.edit" })).toBe("allowed");
  });

  it("renders an explicit no-access state for a role-blocked action", () => {
    const html = renderToStaticMarkup(
      <AuthProvider initialSession={session}>
        <WorkspaceProvider workspaceId="ws-1" initialWorkspace={workspace} initialRole="VIEWER">
          <ProtectedRoute requiredPermission="creative.edit">Editor only</ProtectedRoute>
        </WorkspaceProvider>
      </AuthProvider>,
    );
    expect(html).toContain('data-guard-state="no-access"');
    expect(html).toContain("Access unavailable");
    expect(html).not.toContain("Editor only");
  });
});
