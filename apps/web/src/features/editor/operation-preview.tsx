import { PlumeBadge, PlumeBanner, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";

export type OperationKind = "resize" | "copy_edit" | "replace_asset";
export type OperationImpact = "low" | "high";
export type OperationStatus = "proposed" | "confirmed" | "applied" | "rejected";

export interface EditOperation {
  readonly id: string;
  readonly kind: OperationKind;
  readonly summary: string;
  readonly before: string;
  readonly after: string;
  readonly impact: OperationImpact;
  readonly status: OperationStatus;
}

export interface OperationPreviewProps {
  operation: EditOperation;
  onConfirm?: () => void;
  onApply?: () => void;
  onReject?: () => void;
}

export function canApplyOperation(operation: EditOperation) {
  return operation.status === "confirmed";
}

export function OperationPreview({
  operation,
  onConfirm,
  onApply,
  onReject,
}: OperationPreviewProps) {
  const canApply = canApplyOperation(operation);
  const isProposed = operation.status === "proposed";

  return (
    <section
      data-plume-feature="operation-preview"
      data-operation-id={operation.id}
      data-operation-kind={operation.kind}
      data-operation-status={operation.status}
      aria-label="AI operation preview"
    >
      <header>
        <PlumeHeading level={3}>Review AI edit</PlumeHeading>
        <PlumeBadge
          label={operation.impact === "high" ? "High impact" : "Low impact"}
          variant={operation.impact === "high" ? "warning" : "info"}
        />
      </header>
      {operation.impact === "high" ? (
        <PlumeBanner
          status="warning"
          title="High-impact change"
          description="Review the complete before/after result and confirm before applying."
          data-plume-region="high-impact-warning"
        />
      ) : null}
      <PlumeText>{operation.summary}</PlumeText>
      <div data-plume-region="operation-comparison">
        <div data-preview-state="before">
          <PlumeText type="supporting">Before</PlumeText>
          <PlumeText>{operation.before}</PlumeText>
        </div>
        <div data-preview-state="after">
          <PlumeText type="supporting">After</PlumeText>
          <PlumeText>{operation.after}</PlumeText>
        </div>
      </div>
      <div data-plume-region="operation-actions">
        {isProposed ? (
          <PlumeButton
            type="button"
            label="Confirm operation"
            variant="secondary"
            {...(onConfirm ? { onClick: onConfirm } : {})}
          />
        ) : null}
        <PlumeButton
          type="button"
          label="Apply operation"
          variant="primary"
          isDisabled={!canApply}
          {...(!canApply
            ? { disabledReason: "Confirm this operation before applying it." }
            : {})}
          {...(onApply ? { onClick: onApply } : {})}
        />
        {onReject ? (
          <PlumeButton
            type="button"
            label="Reject operation"
            variant="ghost"
            onClick={onReject}
          />
        ) : null}
      </div>
    </section>
  );
}
