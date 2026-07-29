import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BriefEditor } from "../src/features/brief/brief-editor.js";
import { BriefReviewScreen } from "../src/screens/brief/brief-review-screen.js";
import { SourceUploadScreen } from "../src/screens/brief/source-upload-screen.js";

describe("BRIEF-01 to BRIEF-02 screen contract fixture", () => {
  it("keeps analysis job identity and separates AI, user, and citation values", () => {
    const field = { id: "objective", label: "Objective", aiValue: "Launch product", userValue: "Launch product in Q3", citations: [{ id: "cite-1", label: "Brief page 2", sourceName: "brief.pdf" }] };
    const html = [
      renderToStaticMarkup(createElement(SourceUploadScreen, { state: "analyzing", analysisJobId: "job-brief-1", files: [{ id: "file-1", filename: "brief.pdf", status: "analyzing", progressPercent: 75 }] })),
      renderToStaticMarkup(createElement(BriefReviewScreen, { state: "ready", fields: [field] })),
      renderToStaticMarkup(createElement(BriefEditor, { fields: [field] })),
    ].join("\n");
    expect(html).toContain("job-brief-1");
    expect(html).toContain('data-brief-origin="ai"');
    expect(html).toContain('data-brief-origin="user"');
    expect(html).toContain("AI proposed");
    expect(html).toContain("User edit");
    expect(html).toContain("brief.pdf");
  });
});
