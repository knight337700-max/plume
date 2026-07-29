import {
  ApprovalStatusPanel,
  PlumeBanner,
  PlumeText,
  PlumeTextArea,
  type ApprovalStatus,
} from "@plume/ui";
import {
  canRolePerform,
  type PermissionAction,
} from "../../app/route-guards.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";

export type ApprovalValidationStatus = "passed" | "failed" | "pending";

export interface ApprovalRecord {
  readonly id: string;
  readonly creativeName: string;
  readonly campaignName: string;
  readonly version: string;
  readonly validationRunId: string;
  readonly validationStatus: ApprovalValidationStatus;
  readonly status: ApprovalStatus;
}

export interface DecisionPanelProps {
  record: ApprovalRecord;
  role?: WorkspaceRole;
  rejectReason?: string;
  onRejectReasonChange?: (reason: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
}

const decisionPermission: PermissionAction = "creative.approve";

export function DecisionPanel({
  record,
  role,
  rejectReason = "",
  onRejectReasonChange,
  onApprove,
  onReject,
}: DecisionPanelProps) {
  const canDecide = canRolePerform(role, decisionPermission) && record.status === "pending";
  const validationPassed = record.validationStatus === "passed";
  const canApprove = canDecide && validationPassed;
  const canReject = canDecide && rejectReason.trim().length > 0;
  const decisionNote = role
    ? `Role: ${role}`
    : "Role is not available; approval actions are hidden.";

  return (
    <section
      data-plume-feature="approval-decision-panel"
      data-decision-status={record.status}
      data-decision-can-approve={String(canApprove)}
      data-decision-can-reject={String(canReject)}
    >
      {!canDecide ? (
        <PlumeBanner
          status="warning"
          title="Decision unavailable"
          description="Your workspace role does not permit approval decisions for this version."
          data-plume-region="decision-permission-blocker"
        />
      ) : null}
      {canDecide && !validationPassed ? (
        <PlumeBanner
          status="error"
          title="Approval blocked by validation"
          description="A passing validation run is required before approval."
          data-plume-region="decision-validation-blocker"
        />
      ) : null}
      <ApprovalStatusPanel
        version={record.version}
        status={record.status}
        errorCount={record.validationStatus === "failed" ? 1 : 0}
        warningCount={record.validationStatus === "pending" ? 1 : 0}
        decisionNote={decisionNote}
        {...(canApprove && onApprove ? { onApprove } : {})}
        {...(canReject && onReject ? { onReject } : {})}
      />
      {canDecide ? (
        <>
          <PlumeTextArea
            label="Rejection reason"
            value={rejectReason}
            onChange={(reason) => onRejectReasonChange?.(reason)}
            isRequired
          />
          {!canReject ? (
            <PlumeText type="supporting">
              Enter a rejection reason to enable Reject.
            </PlumeText>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
