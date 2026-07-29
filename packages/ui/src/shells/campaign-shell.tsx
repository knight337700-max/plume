import type { ReactNode } from "react";
import {
  PlumeAppShell,
  PlumeLayoutPanel,
  PlumeResizeHandle,
} from "../components/index.js";

export interface CampaignWorkShellProps {
  children: ReactNode;
  contextHeader?: ReactNode;
  workflowRail: ReactNode;
  contextPanel?: ReactNode;
}

export function CampaignWorkShell({
  children,
  contextHeader,
  workflowRail,
  contextPanel,
}: CampaignWorkShellProps) {
  return (
    <PlumeAppShell
      height="fill"
      data-plume-shell="campaign-work"
      data-plume-mobile-mode="read-review-only"
    >
      {contextHeader ? (
        <header data-plume-region="campaign-context-header">{contextHeader}</header>
      ) : null}
      <section data-plume-region="campaign-regions">
        <aside data-plume-region="global-icon-rail" data-region-width="64px" />
        <PlumeLayoutPanel
          widthPreset="compact"
          role="navigation"
          label="Campaign workflow"
          data-plume-region="workflow-rail"
          data-region-width="256px"
        >
          {workflowRail}
        </PlumeLayoutPanel>
        <PlumeResizeHandle label="Resize workflow panel" />
        <section data-plume-region="campaign-main-work" data-region-min-width="720px">
          {children}
        </section>
        {contextPanel ? (
          <PlumeLayoutPanel
            widthPreset="inspector"
            role="complementary"
            label="Campaign context"
            data-plume-region="context-panel"
            data-region-width="360px"
          >
            {contextPanel}
          </PlumeLayoutPanel>
        ) : null}
      </section>
    </PlumeAppShell>
  );
}
