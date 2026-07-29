import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
} from "@plume/ui";
import { canRolePerform } from "../../app/route-guards.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";

export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: "channel" | "format" | "template";
  readonly status: "active" | "pending_verify" | "archived";
  readonly revision: string;
}

export interface CatalogAdminScreenProps {
  entries?: readonly CatalogEntry[];
  role?: WorkspaceRole;
  onCreateEntry?: () => void;
}

export function CatalogAdminScreen({
  entries = [],
  role,
  onCreateEntry,
}: CatalogAdminScreenProps) {
  const canManage = canRolePerform(role, "catalog.manage");

  return (
    <main
      data-screen-id="CATALOG-01"
      data-screen-state={canManage ? "ready" : "no-access"}
      data-admin-role-guard="catalog.manage"
    >
      <header>
        <PlumeHeading level={1}>Catalog administration</PlumeHeading>
        {canManage && onCreateEntry ? (
          <PlumeButton
            type="button"
            label="Create catalog entry"
            variant="primary"
            onClick={onCreateEntry}
          />
        ) : null}
      </header>
      {!canManage ? (
        <PlumeBanner
          status="warning"
          title="Admin access required"
          description="Only workspace owners and admins can manage catalog entries."
          data-plume-region="catalog-permission-blocker"
        />
      ) : entries.length === 0 ? (
        <PlumeEmptyState
          title="No catalog entries"
          description="Create a channel, format, or template profile to make it available to campaigns."
        />
      ) : (
        <ul aria-label="Catalog entries">
          {entries.map((entry) => (
            <li key={entry.id} data-catalog-entry-id={entry.id}>
              <PlumeText>{entry.name}</PlumeText>
              <PlumeText type="supporting">{entry.kind} · Revision {entry.revision}</PlumeText>
              <PlumeBadge label={entry.status} variant={entry.status === "active" ? "success" : "warning"} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
