import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlumeEmptyState,
  PlumeList,
  PlumeProgress,
  PlumeSkeleton,
  PlumeTable,
} from "./index.js";

describe("data and feedback wrappers", () => {
  it("keeps table headers and sort state discoverable", () => {
    const html = renderToStaticMarkup(
      <PlumeTable data={[]} columns={[]} sortState={{ status: "ascending" }} />,
    );

    expect(html).toContain('data-plume-component="table"');
    expect(html).toContain('data-plume-sort-state="{&quot;status&quot;:&quot;ascending&quot;}"');
  });

  it("exposes progress value and current workflow step", () => {
    const html = renderToStaticMarkup(
      <PlumeProgress
        label="Generation"
        value={2}
        max={3}
        currentStep={{ current: 2, total: 3, label: "Generation" }}
      />,
    );

    expect(html).toContain('data-plume-current-step="2"');
    expect(html).toContain("Step 2 of 3");
  });

  it("marks empty, list, and loading states semantically", () => {
    const html = renderToStaticMarkup(
      <>
        <PlumeEmptyState title="No campaigns" />
        <PlumeList aria-label="Campaigns">Campaigns</PlumeList>
        <PlumeSkeleton aria-label="Loading campaigns" />
      </>,
    );

    expect(html).toContain('data-plume-component="empty-state"');
    expect(html).toContain('<ul role="list"');
    expect(html).toContain('data-plume-component="skeleton"');
  });
});
