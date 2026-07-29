import type { ReactNode } from "react";
import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeStatusDot,
  PlumeText,
} from "../components/index.js";

export type ValidationIssueSeverity = "error" | "warning" | "info";

export interface ValidationIssueCardProps {
  id: string;
  severity: ValidationIssueSeverity;
  target: string;
  message: ReactNode;
  suggestedFix?: ReactNode;
  onFix?: () => void;
  onAcknowledgeWarning?: () => void;
}

const severityLabels: Record<ValidationIssueSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export function ValidationIssueCard({
  id,
  severity,
  target,
  message,
  suggestedFix,
  onFix,
  onAcknowledgeWarning,
}: ValidationIssueCardProps) {
  return (
    <article
      data-plume-component="validation-issue-card"
      data-issue-id={id}
      data-issue-severity={severity}
    >
      <PlumeStatusDot variant={severity === "info" ? "accent" : severity} label={severityLabels[severity]} />
      <PlumeBadge label={severityLabels[severity]} variant={severity === "info" ? "info" : severity} />
      <PlumeText>Target: {target}</PlumeText>
      <PlumeText>{message}</PlumeText>
      {suggestedFix ? (
        <PlumeText type="supporting">Suggested fix: {suggestedFix}</PlumeText>
      ) : null}
      {severity === "error" && onFix ? (
        <PlumeButton type="button" label="Edit issue" variant="primary" onClick={onFix} />
      ) : null}
      {severity === "warning" && onAcknowledgeWarning ? (
        <PlumeButton
          type="button"
          label="Acknowledge warning"
          variant="secondary"
          onClick={onAcknowledgeWarning}
        />
      ) : null}
    </article>
  );
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "blocked" | "not-ready";

export interface ApprovalStatusPanelProps {
  version: string;
  status: ApprovalStatus;
  errorCount: number;
  warningCount: number;
  decisionNote?: ReactNode;
  onApprove?: () => void;
  onReject?: () => void;
}

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  blocked: "Blocked",
  "not-ready": "Not ready for approval",
};

export function ApprovalStatusPanel({
  version,
  status,
  errorCount,
  warningCount,
  decisionNote,
  onApprove,
  onReject,
}: ApprovalStatusPanelProps) {
  const canApprove = status === "pending" && errorCount === 0;
  const statusVariant = status === "approved" ? "success" : status === "rejected" || status === "blocked" ? "error" : status === "pending" ? "warning" : "neutral";

  return (
    <section
      data-plume-component="approval-status-panel"
      data-approval-status={status}
      aria-label="Approval status"
    >
      <PlumeStatusDot variant={statusVariant} label={approvalLabels[status]} />
      <PlumeBadge label={approvalLabels[status]} variant={statusVariant} />
      <PlumeText>Creative version: {version}</PlumeText>
      <PlumeText type="supporting">Errors: {errorCount}</PlumeText>
      <PlumeText type="supporting">Warnings: {warningCount}</PlumeText>
      {errorCount > 0 ? (
        <PlumeBanner
          status="error"
          title="Approval blocked"
          description="Resolve validation errors before requesting approval."
          data-plume-region="approval-blocker"
        />
      ) : null}
      {decisionNote ? <PlumeText type="supporting">{decisionNote}</PlumeText> : null}
      {onApprove ? (
        <PlumeButton
          type="button"
          label="Approve"
          variant="primary"
          isDisabled={!canApprove}
          {...(!canApprove
            ? {
                disabledReason:
                  "Approval is unavailable until validation errors are resolved.",
              }
            : {})}
          onClick={onApprove}
        />
      ) : null}
      {onReject ? (
        <PlumeButton type="button" label="Reject" variant="destructive" onClick={onReject} />
      ) : null}
    </section>
  );
}
