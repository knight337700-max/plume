import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AuthWorkspaceShell,
  CampaignWorkShell,
  CreativeEditorShell,
  GlobalAppShell,
  ReviewShell,
} from "./index.js";

describe("application shells", () => {
  it("renders all five shell frames with their region contracts", () => {
    const html = [
      renderToStaticMarkup(<AuthWorkspaceShell>Sign in</AuthWorkspaceShell>),
      renderToStaticMarkup(
        <GlobalAppShell topNav="Top" sideNav="Side">Dashboard</GlobalAppShell>,
      ),
      renderToStaticMarkup(
        <CampaignWorkShell workflowRail="Steps">Campaign</CampaignWorkShell>,
      ),
      renderToStaticMarkup(
        <CreativeEditorShell creativeList="List" inspector="Inspector">
          Canvas
        </CreativeEditorShell>,
      ),
      renderToStaticMarkup(
        <ReviewShell inspector="Review">Preview</ReviewShell>,
      ),
    ].join("\n");

    expect(html).toContain('data-plume-shell="auth-workspace"');
    expect(html).toContain('data-plume-shell="global-app"');
    expect(html).toContain('data-plume-shell="campaign-work"');
    expect(html).toContain('data-plume-shell="creative-editor"');
    expect(html).toContain('data-plume-shell="review"');
    expect(html).toContain('data-region-width="256px"');
    expect(html).toContain('data-region-min-width="640px"');
  });

  it("records compact and mobile behavior for review-only modes", () => {
    const html = renderToStaticMarkup(
      <CampaignWorkShell workflowRail="Steps">Campaign</CampaignWorkShell>,
    );

    expect(html).toContain('data-plume-mobile-mode="read-review-only"');
    expect(html).toContain('data-plume-region="workflow-rail"');
  });
});
