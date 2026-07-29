import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx layout primitives are consumed through the adapter. */
import {
  AstryxAppShell,
  AstryxLayoutPanel,
  AstryxResizeHandle,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeAppShellProps = ComponentProps<typeof AstryxAppShell>;

export function PlumeAppShell({ height = "fill", ...props }: PlumeAppShellProps) {
  return (
    <AstryxAppShell
      {...props}
      height={height}
      data-plume-component="app-shell"
    />
  );
}

export type PlumePanelWidthPreset = "navigation" | "compact" | "inspector";

const panelWidths: Record<PlumePanelWidthPreset, number> = {
  navigation: 256,
  compact: 232,
  inspector: 380,
};

export type PlumeLayoutPanelProps = ComponentProps<typeof AstryxLayoutPanel> & {
  widthPreset?: PlumePanelWidthPreset;
};

export function PlumeLayoutPanel({
  width,
  widthPreset,
  ...props
}: PlumeLayoutPanelProps) {
  const resolvedWidth = width ?? (widthPreset ? panelWidths[widthPreset] : undefined);

  return (
    <AstryxLayoutPanel
      {...props}
      {...(resolvedWidth === undefined ? {} : { width: resolvedWidth })}
      data-plume-component="layout-panel"
      data-plume-width-preset={widthPreset}
    />
  );
}

export type PlumeResizeHandleProps = ComponentProps<typeof AstryxResizeHandle>;

export function PlumeResizeHandle({
  label = "Resize panel",
  ...props
}: PlumeResizeHandleProps) {
  return (
    <AstryxResizeHandle
      {...props}
      label={label}
      data-plume-component="resize-handle"
    />
  );
}
