import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalDetailScreen } from "../src/screens/approval/approval-detail-screen.js";
import { ApprovalQueueScreen } from "../src/screens/approval/approval-queue-screen.js";
import type { ApprovalRecord } from "../src/features/approval/decision-panel.js";

const record: ApprovalRecord = {
  id: "approval-1",
  creativeName: "Summer campaign hero",
  campaignName: "Summer launch",
  version: "v7",
  validationRunId: "validation-run-42",
  validationStatus: "passed",
  status: "pending",
};

describe("APPROVAL-01 and APPROVAL-02 contract fixtures", () => {
  it("shows exact version and validation run in queue and detail", () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalQueueScreen, {
        records: [record],
        role: "REVIEWER",
        onOpenDetail: () => undefined,
      }),
    ) + renderToStaticMarkup(
      createElement(ApprovalDetailScreen, {
        record,
        role: "REVIEWER",
        rejectReason: "Please adjust the safe-area copy.",
        onApprove: () => undefined,
        onReject: () => undefined,
      }),
    );

    expect(html).toContain('data-screen-id="APPROVAL-01"');
    expect(html).toContain('data-screen-id="APPROVAL-02"');
    expect(html).toContain("Exact version: v7");
    expect(html).toContain("Validation run: validation-run-42");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });

  it("hides decision actions when the role lacks creative approval permission", () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalDetailScreen, {
        record,
        role: "EDITOR",
        rejectReason: "Reason exists but editor cannot decide.",
        onApprove: () => undefined,
        onReject: () => undefined,
      }),
    );

    expect(html).toContain("Decision unavailable");
    expect(html).toContain('data-decision-can-approve="false"');
    expect(html).not.toMatch(/>Approve</);
    expect(html).not.toMatch(/>Reject</);
  });
});
