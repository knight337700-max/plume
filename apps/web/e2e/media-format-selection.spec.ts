import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChannelSelectionScreen } from "../src/screens/media/channel-selection-screen.js";
import { FormatSelectionScreen } from "../src/screens/media/format-selection-screen.js";

describe("MEDIA-01 and MEDIA-02 selection contract fixtures", () => {
  it("renders channel support details and format specs", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelSelectionScreen, {
        channels: [
          {
            id: "social",
            label: "Social",
            description: "Paid social placements",
            supportRange: "1:1 to 9:16",
            activeFormatCount: 4,
            validationStatus: "passed",
          },
        ],
      }),
    ) + renderToStaticMarkup(
      createElement(FormatSelectionScreen, {
        formats: [
          {
            id: "square-1080",
            label: "Square post",
            ratio: "1:1",
            width: 1080,
            height: 1080,
            requirements: "PNG or JPG · sRGB",
            status: "active",
          },
        ],
      }),
    );

    expect(html).toContain('data-screen-id="MEDIA-01"');
    expect(html).toContain('data-screen-id="MEDIA-02"');
    expect(html).toContain("Support: 1:1 to 9:16");
    expect(html).toContain("Ratio 1:1");
    expect(html).toContain("1080×1080");
    expect(html).toContain("PNG or JPG · sRGB");
  });

  it("disables pending verification formats and exposes the blocker reason", () => {
    const html = renderToStaticMarkup(
      createElement(FormatSelectionScreen, {
        formats: [
          {
            id: "story-pending",
            label: "Story profile",
            ratio: "9:16",
            width: 1080,
            height: 1920,
            requirements: "Awaiting platform verification",
            status: "PENDING_VERIFY",
            blockerReason: "Platform specification is not verified yet.",
          },
        ],
      }),
    );

    expect(html).toContain('data-format-card-status="PENDING_VERIFY"');
    expect(html).toContain("Platform specification is not verified yet.");
    expect(html).toContain("Pending verification");
    expect(html).toContain("disabled");
  });
});
