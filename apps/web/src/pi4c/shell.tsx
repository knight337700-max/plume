import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useTheme } from "./theme";

const blackLogo = new URL("../../../../docs/pi-4b/assets/brand/GobanOS_bk.svg", import.meta.url)
  .href;
const whiteLogo = new URL("../../../../docs/pi-4b/assets/brand/GobanOS_wh.svg", import.meta.url)
  .href;

const icon = (value: string) => (
  <span className="g-nav-icon" aria-hidden="true">
    {value}
  </span>
);

function navigationClass({ isActive }: { readonly isActive: boolean }) {
  return isActive ? "g-nav-link is-active" : "g-nav-link";
}

export function WorkspaceShell() {
  const { workspaceId = "" } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const { resolved } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogTitleId = useId();
  const campaignId =
    location.pathname.match(/\/campaigns\/([^/]+)/)?.[1] ?? search.get("campaignId");
  const projectId = location.pathname.match(/\/projects\/([^/]+)/)?.[1] ?? search.get("projectId");
  const contextQuery = new URLSearchParams();
  if (campaignId) contextQuery.set("campaignId", campaignId);
  if (projectId) contextQuery.set("projectId", projectId);
  const aiCreativeHref = `/w/${workspaceId}/ai-creative/setup${contextQuery.size ? `?${contextQuery}` : ""}`;

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  const navigation = (
    <>
      <div className="g-nav-section-label">Workspace</div>
      <NavLink to={aiCreativeHref} className={navigationClass}>
        {icon("✦")}
        <span>AI Creative</span>
      </NavLink>
      <NavLink
        to={`/w/${workspaceId}/campaigns${campaignId ? `/${campaignId}` : ""}`}
        className={navigationClass}
      >
        {icon("▣")}
        <span>Campaign / Project</span>
      </NavLink>
      <div className="g-nav-spacer" />
      <NavLink to={`/w/${workspaceId}/settings`} className={navigationClass}>
        {icon("⚙")}
        <span>Settings</span>
      </NavLink>
    </>
  );

  return (
    <div className="g-app" data-theme-resolved={resolved}>
      <a className="g-skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="g-sidebar" aria-label="Primary navigation">
        <Link
          to={`/w/${workspaceId}/ai-creative/setup`}
          className="g-brand"
          aria-label="Gobanos home"
        >
          <img src={resolved === "dark" ? whiteLogo : blackLogo} alt="Gobanos" />
        </Link>
        <nav className="g-primary-nav">{navigation}</nav>
        <div className="g-user-card">
          <span className="g-avatar" aria-hidden="true">
            U
          </span>
          <span>
            <strong>Gobanos Studio</strong>
            <small>Workspace {workspaceId.slice(0, 8) || "—"}</small>
          </span>
        </div>
      </aside>

      <div className="g-app-column">
        <header className="g-topbar">
          <button
            ref={menuButtonRef}
            className="g-mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
          <div className="g-context-trail" aria-label="Current context">
            <span>Gobanos Studio</span>
            {campaignId ? (
              <>
                <span aria-hidden="true">/</span>
                <span>Campaign</span>
              </>
            ) : null}
            {projectId ? (
              <>
                <span aria-hidden="true">/</span>
                <span>Project</span>
              </>
            ) : null}
          </div>
          <div className="g-top-actions">
            <span className="g-system-status">
              <i aria-hidden="true" /> Workspace context active
            </span>
          </div>
        </header>
        <main id="main-content" className="g-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <div className="g-modal-backdrop" role="presentation" onMouseDown={closeMenu}>
          <section
            className="g-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="g-drawer-header">
              <h2 id={dialogTitleId}>Navigation</h2>
              <button
                className="g-icon-action"
                type="button"
                aria-label="Close navigation"
                autoFocus
                onClick={closeMenu}
              >
                ×
              </button>
            </div>
            <nav className="g-primary-nav">{navigation}</nav>
          </section>
        </div>
      ) : null}
    </div>
  );
}
