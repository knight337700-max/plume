import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardScreen } from "./dashboard-screen.js";

describe("DASH-01 dashboard", () => {
  it("renders campaign, approval, job, and export summaries with the primary CTA", () => {
    const html = renderToStaticMarkup(
      <DashboardScreen
        workspaceName="Acme workspace"
        summary={{
          campaigns: { total: 12, recent: 3 },
          approvals: { pending: 4 },
          jobs: { running: 2, failed: 1 },
          exports: { completed: 8, failed: 0 },
        }}
        onNewCampaign={() => undefined}
      />,
    );
    expect(html).toContain('data-screen-id="DASH-01"');
    expect(html).toContain('data-summary-id="campaigns"');
    expect(html).toContain('data-summary-id="approvals"');
    expect(html).toContain('data-summary-id="jobs"');
    expect(html).toContain('data-summary-id="exports"');
    expect(html).toContain("New campaign");
    expect(html).toContain("12");
    expect(html).toContain("4");
  });
});
