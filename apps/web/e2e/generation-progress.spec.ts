import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerationConfigScreen } from "../src/screens/generation/generation-config-screen.js";
import { GenerationProgressScreen } from "../src/screens/generation/generation-progress-screen.js";
import { createJobEventsStore } from "../src/stores/job-events.js";

describe("GEN-01 and GEN-02 generation contract fixtures", () => {
  it("shows the expected creative count before submission", () => {
    const html = renderToStaticMarkup(
      createElement(GenerationConfigScreen, {
        expectedCreativeCount: 6,
        selectedChannelCount: 2,
        selectedFormatCount: 3,
        onSubmit: () => undefined,
      }),
    );

    expect(html).toContain('data-screen-id="GEN-01"');
    expect(html).toContain("Expected creatives: 6");
    expect(html).toContain("2 channels × 3 formats");
    expect(html).toContain("Start generation");
  });

  it("renders three item progress updates from the SSE job store", () => {
    const store = createJobEventsStore();
    const items = [
      { id: "creative-1", jobId: "job-item-1", label: "Creative 1", status: "queued" as const },
      { id: "creative-2", jobId: "job-item-2", label: "Creative 2", status: "queued" as const },
      { id: "creative-3", jobId: "job-item-3", label: "Creative 3", status: "queued" as const },
    ];
    store.apply({ id: "event-1", event: "job.progress", data: { jobId: "job-item-1", status: "completed", progressPercent: 100 } });
    store.apply({ id: "event-2", event: "job.progress", data: { jobId: "job-item-2", status: "running", progressPercent: 66 } });
    store.apply({ id: "event-3", event: "job.progress", data: { jobId: "job-item-3", status: "failed", progressPercent: 35, message: "Render failed" } });

    const html = renderToStaticMarkup(
      createElement(GenerationProgressScreen, {
        jobId: "generation-42",
        items,
        state: "partial_success",
        jobEventsStore: store,
      }),
    );

    expect(html).toContain('data-screen-id="GEN-02"');
    expect(html).toContain("generation-42");
    expect(html).toContain('data-job-item-id="creative-1" data-job-item-status="completed"');
    expect(html).toContain('data-job-item-id="creative-2" data-job-item-status="running"');
    expect(html).toContain('data-job-item-id="creative-3" data-job-item-status="failed"');
    expect(html).toContain("100%");
    expect(html).toContain("66%");
    expect(html).toContain("35%");
    expect(html).toContain("Render failed");
    expect(html).toContain("Generation partially completed");
  });
});
