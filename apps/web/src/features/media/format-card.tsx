import {
  FormatProfileCard as DomainFormatProfileCard,
  type FormatProfileCardProps as DomainFormatProfileCardProps,
} from "@plume/ui";
import { PlumeText } from "@plume/ui";

export type FormatCardProps = Omit<
  DomainFormatProfileCardProps,
  "isSelected" | "onChange"
> & {
  isSelected?: boolean;
};

function isPendingVerification(status: FormatCardProps["status"]) {
  return (
    status === "pending" ||
    status === "pending_verify" ||
    status === "PENDING_VERIFY"
  );
}

export function FormatCard({
  blockerReason,
  isSelected = false,
  onChange,
  ...format
}: FormatCardProps & {
  onChange: (isSelected: boolean) => void;
}) {
  const pending = isPendingVerification(format.status);
  const reason =
    blockerReason ??
    "This format is pending verification and cannot be selected yet.";

  return (
    <div
      data-plume-feature="format-card"
      data-format-card-id={format.id}
      data-format-card-status={format.status}
    >
      <DomainFormatProfileCard
        {...format}
        {...(blockerReason ? { blockerReason } : {})}
        isSelected={isSelected}
        onChange={onChange}
      />
      {pending ? (
        <PlumeText type="supporting" data-format-blocker-reason="true">
          Reason: {reason}
        </PlumeText>
      ) : null}
    </div>
  );
}
