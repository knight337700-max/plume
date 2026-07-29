import {
  PlumeBadge,
  PlumeButton,
  PlumeText,
} from "@plume/ui";

export type CreativeStatus =
  | "generating"
  | "ready"
  | "validation_failed"
  | "validated"
  | "approved"
  | "failed";

export interface CreativeResultCardProps {
  id: string;
  productId: string;
  productName: string;
  formatId: string;
  formatLabel: string;
  status: CreativeStatus;
  previewLabel?: string;
  version?: string;
  onEdit?: () => void;
  onValidate?: () => void;
}

const statusLabels: Record<CreativeStatus, string> = {
  generating: "Generating",
  ready: "Ready for validation",
  validation_failed: "Validation failed",
  validated: "Validated",
  approved: "Approved",
  failed: "Generation failed",
};

const statusVariants: Record<CreativeStatus, "success" | "warning" | "error" | "info" | "neutral"> = {
  generating: "info",
  ready: "success",
  validation_failed: "error",
  validated: "success",
  approved: "success",
  failed: "error",
};

function canEdit(status: CreativeStatus) {
  return status === "ready" || status === "validation_failed";
}

function canValidate(status: CreativeStatus) {
  return status === "ready" || status === "validation_failed";
}

export function CreativeResultCard({
  id,
  productId,
  productName,
  formatId,
  formatLabel,
  status,
  previewLabel = "Generated creative preview",
  version = "v1",
  onEdit,
  onValidate,
}: CreativeResultCardProps) {
  const editEnabled = canEdit(status);
  const validateEnabled = canValidate(status);
  const editReason =
    status === "generating"
      ? "Editing is available after generation finishes."
      : status === "approved"
        ? "Approved creatives are locked."
        : "This creative cannot be edited in its current state.";
  const validateReason =
    status === "generating"
      ? "Validation is available after generation finishes."
      : status === "approved" || status === "validated"
        ? "This creative has already been validated."
        : "Validation is unavailable in the current state.";

  return (
    <article
      data-plume-feature="creative-result-card"
      data-creative-id={id}
      data-creative-product-id={productId}
      data-creative-format-id={formatId}
      data-creative-status={status}
    >
      <figure data-creative-preview={formatId}>
        <PlumeText>{previewLabel}</PlumeText>
        <figcaption>
          <PlumeText type="supporting">{formatLabel}</PlumeText>
        </figcaption>
      </figure>
      <PlumeText>{productName}</PlumeText>
      <PlumeText type="supporting">Version {version}</PlumeText>
      <PlumeBadge label={statusLabels[status]} variant={statusVariants[status]} />
      <div data-plume-region="creative-actions">
        <PlumeButton
          type="button"
          label="Edit creative"
          variant="secondary"
          isDisabled={!editEnabled}
          data-creative-action="edit"
          {...(!editEnabled ? { disabledReason: editReason } : {})}
          {...(onEdit ? { onClick: onEdit } : {})}
        />
        <PlumeButton
          type="button"
          label="Validate creative"
          variant="primary"
          isDisabled={!validateEnabled}
          data-creative-action="validate"
          {...(!validateEnabled ? { disabledReason: validateReason } : {})}
          {...(onValidate ? { onClick: onValidate } : {})}
        />
      </div>
    </article>
  );
}
