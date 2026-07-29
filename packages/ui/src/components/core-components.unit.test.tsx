import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeHeading,
  PlumeIconButton,
  PlumeStatusDot,
  PlumeText,
} from "./index.js";

describe("core Plume wrappers", () => {
  it("keeps disabled reasons available to assistive technology", () => {
    const html = renderToStaticMarkup(
      <PlumeButton label="Save" disabledReason="Campaign is locked." isDisabled />,
    );

    expect(html).toContain('data-plume-component="button"');
    expect(html).toContain("aria-describedby");
    expect(html).toContain("Campaign is locked.");
  });

  it("requires an accessible label for icon-only actions", () => {
    const html = renderToStaticMarkup(
      <PlumeIconButton label="Open settings" icon={<span>⚙</span>} />,
    );

    expect(html).toContain('data-plume-component="icon-button"');
    expect(html).toContain("Open settings");
  });

  it("applies semantic defaults across content and status wrappers", () => {
    const html = renderToStaticMarkup(
      <>
        <PlumeHeading level={2}>Campaign</PlumeHeading>
        <PlumeText>Ready for review</PlumeText>
        <PlumeBadge label="Approved" variant="success" />
        <PlumeStatusDot label="Approved" variant="success" />
        <PlumeBanner status="success" title="Saved" />
      </>,
    );

    expect(html).toContain('data-plume-component="heading"');
    expect(html).toContain('data-plume-component="text"');
    expect(html).toContain('data-plume-component="badge"');
    expect(html).toContain('data-plume-component="status-dot"');
    expect(html).toContain('data-plume-component="banner"');
  });
});
