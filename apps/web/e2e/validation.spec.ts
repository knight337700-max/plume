import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ValidationDetailScreen } from "../src/screens/validation/validation-detail-screen.js";
import { recordWarningAcknowledgement } from "../src/features/validation/issue-list.js";

describe("VALID-01 validation contract fixture", () => {
  it("highlights the issue element and records warning acknowledgement reason", () => {
    const acknowledgement = recordWarningAcknowledgement(
      {},
      "warning-1",
      "Reviewed against the approved brand guide.",
    );
    const html = renderToStaticMarkup(
      createElement(ValidationDetailScreen, {
        version: "v3",
        issues: [
          {
            id: "error-1",
            severity: "error",
            target: "Headline text",
            elementId: "text-1",
            message: "Headline exceeds the safe area.",
            suggestedFix: "Edit the headline in the editor.",
          },
          {
            id: "warning-1",
            severity: "warning",
            target: "Logo contrast",
            elementId: "logo-1",
            message: "Logo contrast is below the recommended threshold.",
          },
        ],
        initialHighlight: { issueId: "error-1", elementId: "text-1", reason: "Headline text" },
        warningAcknowledgements: acknowledgement,
        onEditIssue: () => undefined,
        onRevalidate: () => undefined,
      }),
    );

    expect(html).toContain('data-screen-id="VALID-01"');
    expect(html).toContain('data-highlighted-element-id="text-1"');
    expect(html).toContain("Element highlighted");
    expect(html).toContain('data-highlight-element-id="text-1"');
    expect(html).toContain('data-highlight-element-id="logo-1"');
    expect(html).toContain("Acknowledgement reason: Reviewed against the approved brand guide.");
    expect(html).toContain("Edit issue");
    expect(html).toContain("Revalidate creative");
  });
});
