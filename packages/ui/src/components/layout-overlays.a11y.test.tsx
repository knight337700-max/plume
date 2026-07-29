import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlumeAppShell,
  PlumeDialog,
  PlumeLayoutPanel,
  PlumeResizeHandle,
} from "./index.js";

describe("layout and overlay wrappers", () => {
  it("preserves native dialog semantics and panel budgets", () => {
    const html = renderToStaticMarkup(
      <PlumeDialog isOpen onOpenChange={() => undefined} aria-label="Campaign details">
        Details
      </PlumeDialog>,
    );

    const panel = renderToStaticMarkup(
      <PlumeLayoutPanel widthPreset="inspector">Inspector</PlumeLayoutPanel>,
    );

    expect(html).toContain('data-plume-component="dialog"');
    expect(html).toContain('aria-label="Campaign details"');
    expect(panel).toContain('data-plume-width-preset="inspector"');
  });

  it("gives shell and resize controls stable accessible defaults", () => {
    const shell = renderToStaticMarkup(<PlumeAppShell>Workspace</PlumeAppShell>);
    const handle = renderToStaticMarkup(<PlumeResizeHandle />);

    expect(shell).toContain('data-plume-component="app-shell"');
    expect(handle).toContain('data-plume-component="resize-handle"');
    expect(handle).toContain("Resize panel");
  });
});
