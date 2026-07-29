import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportConfigScreen } from "../src/screens/export/export-config-screen.js";
import { ExportHistoryScreen } from "../src/screens/export/export-history-screen.js";

describe("EXPORT-01 and EXPORT-02 contract fixtures", () => {
  it("shows eligibility blockers before submit", () => {
    const html = renderToStaticMarkup(
      createElement(ExportConfigScreen, {
        version: "v4",
        eligibility: "blocked",
        blockerReasons: ["Validation errors remain.", "Approval is still pending."],
        files: [
          { name: "manifest.json", kind: "manifest", status: "pending" },
        ],
        onCreateExport: () => undefined,
      }),
    );

    expect(html).toContain('data-screen-id="EXPORT-01"');
    expect(html).toContain("Eligibility blockers before submit:");
    expect(html).toContain("Validation errors remain.");
    expect(html).toContain("Approval is still pending.");
    expect(html).toContain("Blocker: Validation errors remain. Approval is still pending.");
    expect(html).toContain("disabled");
  });

  it("uses signed URLs for completed history files", () => {
    const html = renderToStaticMarkup(
      createElement(ExportHistoryScreen, {
        entries: [
          {
            id: "export-1",
            version: "v4",
            status: "completed",
            createdAt: "2026-07-29T10:00:00Z",
            files: [
              {
                name: "campaign.zip",
                kind: "archive",
                status: "completed",
                signedUrl: "https://storage.example.test/signed/export-1?token=abc",
              },
            ],
          },
        ],
      }),
    );

    expect(html).toContain('data-screen-id="EXPORT-02"');
    expect(html).toContain('data-signed-download="true"');
    expect(html).toContain('href="https://storage.example.test/signed/export-1?token=abc"');
  });
});
