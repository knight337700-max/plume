import { describe, expect, it } from "vitest";
import { deriveWorkflowViewModel } from "./workflow-view-model.js";

describe("campaign workflow view model", () => {
  it("derives blocker and stale recovery actions before next-step CTA", () => {
    expect(deriveWorkflowViewModel({ currentStep: "BRIEF", blockers: [] }).ctaLabel).toBe("Continue: Review AI brief");
    expect(deriveWorkflowViewModel({ currentStep: "BRIEF", blockers: [{ code: "SOURCES_REQUIRED", message: "Upload a source" }] }).ctaAction).toBe("resolve-blockers");
    expect(deriveWorkflowViewModel({ currentStep: "BRIEF", blockers: [], isStale: true }).ctaAction).toBe("refresh");
    expect(deriveWorkflowViewModel({ currentStep: "READY", blockers: [] }).ctaDisabled).toBe(true);
  });
});
