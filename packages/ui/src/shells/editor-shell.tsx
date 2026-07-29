import type { ReactNode } from "react";
import {
  PlumeAppShell,
  PlumeLayoutPanel,
  PlumeResizeHandle,
} from "../components/index.js";

export interface CreativeEditorShellProps {
  children: ReactNode;
  toolbar?: ReactNode;
  creativeList: ReactNode;
  inspector: ReactNode;
  footer?: ReactNode;
}

export function CreativeEditorShell({
  children,
  toolbar,
  creativeList,
  inspector,
  footer,
}: CreativeEditorShellProps) {
  return (
    <PlumeAppShell
      height="fill"
      contentPadding={0}
      data-plume-shell="creative-editor"
      data-plume-mobile-mode="preview-review-only"
    >
      {toolbar ? <header data-plume-region="editor-toolbar">{toolbar}</header> : null}
      <section data-plume-region="editor-regions">
        <aside data-plume-region="editor-icon-rail" data-region-width="64px" />
        <PlumeLayoutPanel
          widthPreset="compact"
          role="navigation"
          label="Creative list"
          data-plume-region="creative-list-panel"
          data-region-width="232px"
        >
          {creativeList}
        </PlumeLayoutPanel>
        <PlumeResizeHandle label="Resize creative list" />
        <section data-plume-region="canvas-workspace" data-region-min-width="640px">
          {children}
        </section>
        <PlumeResizeHandle label="Resize context inspector" />
        <PlumeLayoutPanel
          widthPreset="inspector"
          role="complementary"
          label="Context inspector"
          data-plume-region="context-inspector"
          data-region-width="380px"
        >
          {inspector}
        </PlumeLayoutPanel>
      </section>
      {footer ? <footer data-plume-region="editor-footer">{footer}</footer> : null}
    </PlumeAppShell>
  );
}
