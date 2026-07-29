import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
  type ApprovalStatus,
} from "@plume/ui";
import { canRolePerform } from "../../app/route-guards.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";
import type { ApprovalRecord } from "../../features/approval/decision-panel.js";

export type ApprovalQueueState = "loading" | "ready" | "empty" | "error";
export type ApprovalQueueFilter = "all" | ApprovalStatus;

export interface ApprovalQueueScreenProps {
  records?: readonly ApprovalRecord[];
  role?: WorkspaceRole;
  filter?: ApprovalQueueFilter;
  state?: ApprovalQueueState;
  onFilterChange?: (filter: ApprovalQueueFilter) => void;
  onOpenDetail?: (recordId: string) => void;
}

export function ApprovalQueueScreen({
  records = [],
  role,
  filter = "all",
  state = records.length === 0 ? "empty" : "ready",
  onFilterChange,
  onOpenDetail,
}: ApprovalQueueScreenProps) {
  const canReview = canRolePerform(role, "creative.review");
  const visibleRecords = records.filter(
    (record) => filter === "all" || record.status === filter,
  );

  return (
    <main data-screen-id="APPROVAL-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Approval queue</PlumeHeading>
        <PlumeText type="supporting">
          {records.length} creative version(s) awaiting review.
        </PlumeText>
      </header>
      {!canReview ? (
        <PlumeBanner
          status="warning"
          title="Review access unavailable"
          description="Your workspace role can view the workspace but cannot review approval items."
          data-plume-region="approval-review-permission"
        />
      ) : null}
      <nav aria-label="Approval filters" data-plume-region="approval-filters">
        {(["all", "pending", "approved", "rejected", "blocked"] as const).map((nextFilter) => (
          <PlumeButton
            key={nextFilter}
            type="button"
            label={nextFilter === "all" ? "All" : nextFilter}
            variant={filter === nextFilter ? "primary" : "ghost"}
            {...(onFilterChange ? { onClick: () => onFilterChange(nextFilter) } : {})}
          />
        ))}
      </nav>
      {state === "loading" ? <PlumeText>Loading approval queue…</PlumeText> : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Approval queue unavailable"
          description="Try refreshing the approval queue."
        />
      ) : null}
      {state === "empty" || (state === "ready" && visibleRecords.length === 0) ? (
        <PlumeEmptyState
          title={state === "empty" ? "No approval requests" : "No matching requests"}
          description="Approval requests will appear here when a creative is ready for review."
        />
      ) : null}
      {state === "ready" && visibleRecords.length > 0 ? (
        <ul aria-label="Approval requests">
          {visibleRecords.map((record) => (
            <li key={record.id} data-approval-record-id={record.id}>
              <PlumeText>{record.creativeName}</PlumeText>
              <PlumeText type="supporting">{record.campaignName}</PlumeText>
              <PlumeText type="supporting">
                Version {record.version} · Validation run {record.validationRunId}
              </PlumeText>
              <PlumeBadge label={record.status} variant={record.status === "pending" ? "warning" : "neutral"} />
              {canReview ? (
                <PlumeButton
                  type="button"
                  label="Open approval detail"
                  variant="secondary"
                  {...(onOpenDetail ? { onClick: () => onOpenDetail(record.id) } : {})}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
