import type { ReactNode } from "react";
import {
  PlumeAppShell,
  PlumeLayoutPanel,
} from "../components/index.js";

export interface ReviewShellProps {
  children: ReactNode;
  contextHeader?: ReactNode;
  inspector: ReactNode;
  decision?: ReactNode;
}

export function ReviewShell({
  children,
  contextHeader,
  inspector,
  decision,
}: ReviewShellProps) {
  return (
    <PlumeAppShell
      height="fill"
      data-plume-shell="review"
      data-plume-mobile-mode="sticky-decision"
    >
      {contextHeader ? (
        <header data-plume-region="review-context-header">{contextHeader}</header>
      ) : null}
      <section data-plume-region="review-regions">
        <section data-plume-region="creative-preview">{children}</section>
        <PlumeLayoutPanel
          widthPreset="inspector"
          role="complementary"
          label="Review inspector"
          data-plume-region="review-inspector"
          data-region-width="400px"
        >
          {inspector}
          {decision ? <footer data-plume-region="decision">{decision}</footer> : null}
        </PlumeLayoutPanel>
      </section>
    </PlumeAppShell>
  );
}
