import type { ReactNode } from "react";
import { PlumeAppShell } from "../components/index.js";

export interface GlobalAppShellProps {
  children: ReactNode;
  topNav?: ReactNode;
  sideNav?: ReactNode;
  banner?: ReactNode;
}

export function GlobalAppShell({
  children,
  topNav,
  sideNav,
  banner,
}: GlobalAppShellProps) {
  return (
    <PlumeAppShell
      topNav={topNav}
      sideNav={sideNav}
      banner={banner}
      data-plume-shell="global-app"
      data-plume-desktop-side-nav="240-264px"
      data-plume-tablet-mode="top-nav-menu"
      data-plume-mobile-mode="menu-dialog"
    >
      <section data-plume-region="global-main-content">{children}</section>
    </PlumeAppShell>
  );
}
