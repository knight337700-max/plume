import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PlumeCheckbox,
  PlumeFileInput,
  PlumeSelectableCard,
  PlumeTextArea,
  PlumeTextInput,
} from "./index.js";

describe("form and selection wrappers", () => {
  it("connects labels and validation messages for text fields", () => {
    const html = renderToStaticMarkup(
      <>
        <PlumeTextInput label="Campaign name" value="" error="Name is required." />
        <PlumeTextArea label="Brief" value="" error="Brief is required." />
      </>,
    );

    expect(html).toContain("Campaign name");
    expect(html).toContain("Name is required.");
    expect(html).toContain("Brief is required.");
    expect(html).toContain('data-plume-component="text-input"');
    expect(html).toContain('data-plume-component="text-area"');
  });

  it("keeps upload and checkbox controls labelled", () => {
    const html = renderToStaticMarkup(
      <>
        <PlumeFileInput label="Source files" value={null} onChange={() => undefined} />
        <PlumeCheckbox label="Use brand assets" value={false} />
      </>,
    );

    expect(html).toContain("Source files");
    expect(html).toContain("Use brand assets");
    expect(html).toContain('data-plume-component="file-input"');
    expect(html).toContain('data-plume-component="checkbox"');
  });

  it("exposes selected state separately from focusable card behavior", () => {
    const html = renderToStaticMarkup(
      <PlumeSelectableCard
        label="Kakao Bizboard"
        isSelected
        onChange={() => undefined}
      >
        Kakao Bizboard
      </PlumeSelectableCard>,
    );

    expect(html).toContain('data-plume-selected="true"');
    expect(html).toContain('aria-label="Kakao Bizboard"');
  });
});
