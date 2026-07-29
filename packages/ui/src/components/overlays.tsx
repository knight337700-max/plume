import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx overlay primitives are consumed through the adapter. */
import {
  AstryxDialog,
  AstryxPopover,
  AstryxToast,
  AstryxTooltip,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeDialogProps = ComponentProps<typeof AstryxDialog>;

export function PlumeDialog(props: PlumeDialogProps) {
  return <AstryxDialog {...props} data-plume-component="dialog" />;
}

export type PlumePopoverProps = ComponentProps<typeof AstryxPopover>;

export function PlumePopover({
  hasAutoFocus = true,
  ...props
}: PlumePopoverProps) {
  return (
    <AstryxPopover
      {...props}
      hasAutoFocus={hasAutoFocus}
      data-plume-component="popover"
    />
  );
}

export type PlumeToastProps = ComponentProps<typeof AstryxToast>;

export function PlumeToast({
  isAutoHide = true,
  autoHideDuration = 5000,
  ...props
}: PlumeToastProps) {
  return (
    <AstryxToast
      {...props}
      isAutoHide={isAutoHide}
      autoHideDuration={autoHideDuration}
      data-plume-component="toast"
    />
  );
}

export type PlumeTooltipProps = ComponentProps<typeof AstryxTooltip>;

export function PlumeTooltip({
  focusTrigger = "auto",
  ...props
}: PlumeTooltipProps) {
  return (
    <AstryxTooltip
      {...props}
      focusTrigger={focusTrigger}
      data-plume-component="tooltip"
    />
  );
}
