import { useState } from "react";
import { PlumeBadge, PlumeHeading, PlumeText } from "@plume/ui";
import {
  DecisionPanel,
  type ApprovalRecord,
} from "../../features/approval/decision-panel.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";

export interface ApprovalDetailScreenProps {
  record: ApprovalRecord;
  role?: WorkspaceRole;
  rejectReason?: string;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onRejectReasonChange?: (reason: string) => void;
}

export function ApprovalDetailScreen({
  record,
  role,
  rejectReason: controlledRejectReason,
  onApprove,
  onReject,
  onRejectReasonChange,
}: ApprovalDetailScreenProps) {
  const [uncontrolledRejectReason, setUncontrolledRejectReason] = useState("");
  const rejectReason = controlledRejectReason ?? uncontrolledRejectReason;
  const handleRejectReasonChange = (reason: string) => {
    setUncontrolledRejectReason(reason);
    onRejectReasonChange?.(reason);
  };

  return (
    <main data-screen-id="APPROVAL-02" data-screen-state={record.status}>
      <header>
        <PlumeHeading level={1}>Approval detail</PlumeHeading>
        <PlumeText>{record.creativeName}</PlumeText>
        <PlumeText type="supporting">Campaign: {record.campaignName}</PlumeText>
      </header>
      <section data-plume-region="approval-version-metadata" aria-label="Version metadata">
        <PlumeText>Exact version: {record.version}</PlumeText>
        <PlumeText type="supporting">Validation run: {record.validationRunId}</PlumeText>
        <PlumeBadge label={`Validation ${record.validationStatus}`} variant={record.validationStatus === "passed" ? "success" : "warning"} />
      </section>
      <DecisionPanel
        record={record}
        {...(role ? { role } : {})}
        rejectReason={rejectReason}
        onRejectReasonChange={handleRejectReasonChange}
        {...(onApprove ? { onApprove } : {})}
        {...(onReject ? { onReject: () => onReject(rejectReason) } : {})}
      />
    </main>
  );
}
