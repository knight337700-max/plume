import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthScreen } from "./auth-screen.js";
import { WorkspaceSelectScreen } from "../workspace/workspace-select-screen.js";

describe("authentication and workspace screens", () => {
  it("keeps labels, expired state, and retry accessible", () => {
    const html = [
      renderToStaticMarkup(<AuthScreen state="expired" errorMessage="Session expired" />),
      renderToStaticMarkup(<AuthScreen state="error" errorMessage="Unable to reach auth service" onRetry={() => undefined} />),
    ].join("\n");
    expect(html).toContain('data-screen-id="AUTH-01"');
    expect(html).toContain("Session expired");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(">Email<");
    expect(html).toContain(">Password<");
    expect(html).toContain("Retry");
  });

  it("renders keyboard-focusable workspace choices and empty state", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSelectScreen
        workspaces={[{ id: "ws-1", name: "Brand workspace", role: "EDITOR" }]}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain('data-screen-id="WS-01"');
    expect(html).toContain('data-workspace-id="ws-1"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Brand workspace");

    const empty = renderToStaticMarkup(<WorkspaceSelectScreen state="empty" />);
    expect(empty).toContain("No workspaces available");
  });
});
