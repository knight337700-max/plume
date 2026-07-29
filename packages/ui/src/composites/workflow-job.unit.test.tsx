import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AsyncJobProgressPanel,
  VersionStatusBar,
  WorkflowStepRail,
} from "./index.js";

describe("workflow and async composites", () => {
  it("renders every workflow step state with a visible status", () => {
    const html = renderToStaticMarkup(
      <WorkflowStepRail
        activeStepId="brief"
        steps={[
          { id: "source", label: "Source", status: "completed" },
          { id: "brief", label: "AI brief", status: "active" },
          { id: "match", label: "Match", status: "available" },
          { id: "locked", label: "Export", status: "locked" },
          { id: "blocked", label: "Review", status: "blocked" },
        ]}
        onStepChange={() => undefined}
      />,
    );

    expect(html).toContain('data-step-status="completed"');
    expect(html).toContain('data-step-status="active"');
    expect(html).toContain('data-step-status="available"');
    expect(html).toContain('data-step-status="locked"');
    expect(html).toContain('data-step-status="blocked"');
    expect(html).toContain("Completed");
    expect(html).toContain("In progress");
    expect(html).toContain("Locked");
    expect(html).toContain("Blocked");
  });

  it("renders job progress, item states, and retry affordances", () => {
    const html = renderToStaticMarkup(
      <AsyncJobProgressPanel
        title="Generate creatives"
        status="running"
        progress={48}
        currentStep={{ current: 2, total: 3, label: "Generating" }}
        items={[
          { id: "one", label: "Item one", status: "completed", progress: 100 },
          { id: "two", label: "Item two", status: "failed", message: "Timed out." },
          { id: "three", label: "Item three", status: "paused" },
        ]}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("Step 2 of 3");
    expect(html).toContain('data-job-status="running"');
    expect(html).toContain('data-job-item-status="completed"');
    expect(html).toContain('data-job-item-status="failed"');
    expect(html).toContain('data-job-item-status="paused"');
    expect(html).toContain("Completed");
    expect(html).toContain("Failed");
    expect(html).toContain("Paused");
    expect(html).toContain("Retry Item two");
  });

  it("renders save, revision, render, and validation status", () => {
    const html = renderToStaticMarkup(
      <VersionStatusBar
        saveState="dirty"
        revision="rev-12"
        renderState="failed"
        validationState="passed"
        onSave={() => undefined}
        onRender={() => undefined}
      />,
    );

    expect(html).toContain('data-plume-component="version-status-bar"');
    expect(html).toContain("Unsaved changes");
    expect(html).toContain("Revision rev-12");
    expect(html).toContain("Render failed");
    expect(html).toContain("Valid");
    expect(html).toContain("Save version");
    expect(html).toContain("Render version");
  });
});
