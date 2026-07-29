import { useId, type ComponentProps, type ReactNode } from "react";
/* eslint-disable no-restricted-imports -- Astryx primitives are consumed through the approved adapter. */
import {
  AstryxButton,
  AstryxIconButton,
  AstryxVisuallyHidden,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

type DisabledPolicyProps = {
  disabledReason?: string;
  permissionDenied?: boolean;
};

function DisabledReason({
  reason,
  id,
}: {
  reason: string | undefined;
  id: string;
}) {
  return reason ? (
    <AstryxVisuallyHidden id={id}>{reason}</AstryxVisuallyHidden>
  ) : null;
}

function describedBy(
  current: string | undefined,
  reasonId: string,
  reason: string | undefined,
) {
  return [current, reason ? reasonId : undefined].filter(Boolean).join(" ") || undefined;
}

export type PlumeButtonProps = ComponentProps<typeof AstryxButton> &
  DisabledPolicyProps;

export function PlumeButton({
  disabledReason,
  permissionDenied = false,
  isDisabled = false,
  "aria-describedby": ariaDescribedBy,
  ...props
}: PlumeButtonProps) {
  const reasonId = useId();
  const reason =
    disabledReason ??
    (permissionDenied ? "권한이 없어 이 작업을 수행할 수 없습니다." : undefined);

  return (
    <>
      <AstryxButton
        {...props}
        data-plume-component="button"
        isDisabled={isDisabled || permissionDenied}
        aria-describedby={describedBy(ariaDescribedBy, reasonId, reason)}
      />
      <DisabledReason id={reasonId} reason={reason} />
    </>
  );
}

export type PlumeIconButtonProps = ComponentProps<typeof AstryxIconButton> &
  DisabledPolicyProps;

export function PlumeIconButton({
  disabledReason,
  permissionDenied = false,
  isDisabled = false,
  "aria-describedby": ariaDescribedBy,
  ...props
}: PlumeIconButtonProps) {
  const reasonId = useId();
  const reason =
    disabledReason ??
    (permissionDenied ? "권한이 없어 이 작업을 수행할 수 없습니다." : undefined);

  return (
    <>
      <AstryxIconButton
        {...props}
        data-plume-component="icon-button"
        isDisabled={isDisabled || permissionDenied}
        aria-describedby={describedBy(ariaDescribedBy, reasonId, reason)}
      />
      <DisabledReason id={reasonId} reason={reason} />
    </>
  );
}

export type PlumeActionContent = ReactNode;
