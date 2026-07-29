import {
  GlobalAppShell,
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeSkeleton,
  PlumeText,
} from "@plume/ui";
import { GlobalNav } from "../../features/navigation/global-nav.js";
import type { DashboardSummary } from "../../features/dashboard/queries.js";

export type DashboardScreenState = "loading" | "ready" | "empty" | "partial_error";

export interface DashboardScreenProps {
  workspaceName?: string;
  state?: DashboardScreenState;
  summary?: DashboardSummary;
  errorMessage?: string;
  onNewCampaign?: () => void;
}

export function DashboardScreen({
  workspaceName = "Workspace",
  state = "ready",
  summary,
  errorMessage,
  onNewCampaign,
}: DashboardScreenProps) {
  const resolvedSummary = summary ?? {
    campaigns: { total: 0, recent: 0 },
    approvals: { pending: 0 },
    jobs: { running: 0, failed: 0 },
    exports: { completed: 0, failed: 0 },
  };
  const summaryCards = [
    { id: "campaigns", label: "Campaigns", value: resolvedSummary.campaigns.total, detail: `${resolvedSummary.campaigns.recent} recent` },
    { id: "approvals", label: "Approvals", value: resolvedSummary.approvals.pending, detail: "pending review" },
    { id: "jobs", label: "Jobs", value: resolvedSummary.jobs.running, detail: `${resolvedSummary.jobs.failed} failed` },
    { id: "exports", label: "Exports", value: resolvedSummary.exports.completed, detail: `${resolvedSummary.exports.failed} failed` },
  ];
  const newCampaignButton = onNewCampaign ? (
    <PlumeButton type="button" label="New campaign" variant="primary" onClick={onNewCampaign} />
  ) : (
    <PlumeButton type="button" label="New campaign" variant="primary" />
  );

  return (
    <div data-screen-id="DASH-01" data-screen-state={state}>
      <GlobalAppShell
        topNav={<header data-plume-region="dashboard-header"><PlumeText>{workspaceName}</PlumeText></header>}
        sideNav={<GlobalNav />}
      >
        <section aria-labelledby="dashboard-heading">
        <header>
          <PlumeHeading level={1}>Dashboard</PlumeHeading>
          {newCampaignButton}
        </header>
        {state === "loading" ? <PlumeSkeleton aria-label="Loading dashboard" /> : null}
        {state === "partial_error" ? (
          <PlumeBanner status="warning" title="Some summaries are unavailable" description={errorMessage ?? "Refresh to load the latest activity."} />
        ) : null}
        {state === "empty" ? (
          <>
            <PlumeEmptyState title="No campaign activity yet" description="Create a campaign to start your first workflow." />
            {newCampaignButton}
          </>
        ) : null}
        {state !== "loading" && state !== "empty" ? (
          <ul aria-label="Workspace summary" data-dashboard-summary>
            {summaryCards.map((card) => (
              <li key={card.id} data-summary-id={card.id}>
                <PlumeText>{card.label}</PlumeText>
                <PlumeHeading level={2}>{card.value}</PlumeHeading>
                <PlumeBadge label={card.detail} variant={card.id === "jobs" && resolvedSummary.jobs.failed > 0 ? "warning" : "neutral"} />
              </li>
            ))}
          </ul>
        ) : null}
        </section>
      </GlobalAppShell>
    </div>
  );
}
