import type { ReactNode } from "react";

export interface AuthWorkspaceShellProps {
  children: ReactNode;
  productIdentity?: ReactNode;
  support?: ReactNode;
  banner?: ReactNode;
}

export function AuthWorkspaceShell({
  children,
  productIdentity,
  support,
  banner,
}: AuthWorkspaceShellProps) {
  return (
    <main data-plume-shell="auth-workspace" data-region-max-width="640px">
      <section data-plume-region="centered-surface">
        <header data-plume-region="product-identity">{productIdentity}</header>
        {banner ? <section data-plume-region="auth-banner">{banner}</section> : null}
        <section data-plume-region="auth-content">{children}</section>
        {support ? <footer data-plume-region="support">{support}</footer> : null}
      </section>
    </main>
  );
}
