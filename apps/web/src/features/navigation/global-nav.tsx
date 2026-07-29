import { PlumeButton, PlumeText } from "@plume/ui";

export interface GlobalNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
}

export interface GlobalNavProps {
  items?: readonly GlobalNavItem[];
  activeId?: string;
}

const defaultItems: readonly GlobalNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "campaigns", label: "Campaigns", href: "/campaigns" },
  { id: "approvals", label: "Approvals", href: "/approvals" },
  { id: "jobs", label: "Jobs", href: "/jobs" },
  { id: "exports", label: "Exports", href: "/exports" },
];

export function GlobalNav({ items = defaultItems, activeId = "dashboard" }: GlobalNavProps) {
  return (
    <nav aria-label="Global navigation" data-plume-feature="global-nav">
      <PlumeText type="supporting">Workspace</PlumeText>
      <ul>
        {items.map((item) => (
          <li key={item.id} data-nav-active={String(item.id === activeId)}>
            <PlumeButton
              label={item.label}
              href={item.href}
              variant={item.id === activeId ? "primary" : "ghost"}
              {...(item.id === activeId ? { "aria-current": "page" } : {})}
              endContent={item.count === undefined ? undefined : <span aria-label={`${item.count} items`}>{item.count}</span>}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
