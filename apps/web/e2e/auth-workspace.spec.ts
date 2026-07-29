import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AuthScreen } from "../src/screens/auth/auth-screen.js";
import { WorkspaceSelectScreen } from "../src/screens/workspace/workspace-select-screen.js";

describe("AUTH-01 to WS-01 screen contract fixture", () => {
  it("covers loading, authentication error, and workspace selection paths", () => {
    const html = [
      renderToStaticMarkup(createElement(AuthScreen, { state: "loading" })),
      renderToStaticMarkup(createElement(AuthScreen, { state: "error", errorMessage: "Invalid credentials" })),
      renderToStaticMarkup(createElement(WorkspaceSelectScreen, { workspaces: [{ id: "ws-1", name: "Workspace" }] })),
    ].join("\n");
    expect(html).toContain('data-screen-state="loading"');
    expect(html).toContain("Invalid credentials");
    expect(html).toContain('data-screen-id="WS-01"');
  });
});
