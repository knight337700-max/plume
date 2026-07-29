import { PlumeBanner, PlumeButton, PlumeHeading, PlumeText, PlumeTextInput } from "@plume/ui";
import { apiClient } from "../../api/client.js";
import { canRolePerform } from "../../app/route-guards.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";

export type SettingsState = "ready" | "saving" | "saved" | "conflict" | "error";
export type SettingsValues = Readonly<Record<string, string>>;

export interface SettingsApiClient {
  put<T>(path: string, body: unknown, init?: RequestInit): Promise<T>;
}

export interface SettingsSaveResponse {
  readonly etag?: string;
  readonly data?: { readonly etag?: string };
}

export function createSettingsSaver(
  client: SettingsApiClient = apiClient,
  workspaceId = "current",
) {
  return async (settings: SettingsValues, etag: string) => {
    const response = await client.put<SettingsSaveResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
      settings,
      { headers: { "If-Match": etag } },
    );
    return response.data?.etag ?? response.etag ?? etag;
  };
}

export interface SettingsScreenProps {
  role?: WorkspaceRole;
  etag: string;
  settings?: SettingsValues;
  state?: SettingsState;
  onSave?: (settings: SettingsValues, etag: string) => void;
  onReloadLatest?: () => void;
}

export function SettingsScreen({
  role,
  etag,
  settings = {},
  state = "ready",
  onSave,
  onReloadLatest,
}: SettingsScreenProps) {
  const canManage = canRolePerform(role, "settings.manage");

  return (
    <main data-screen-id="SET-01" data-screen-state={canManage ? state : "no-access"}>
      <header>
        <PlumeHeading level={1}>Workspace settings</PlumeHeading>
        <PlumeText type="supporting">Settings are protected by an ETag concurrency check.</PlumeText>
      </header>
      {!canManage ? (
        <PlumeBanner
          status="warning"
          title="Settings access unavailable"
          description="Only workspace owners and admins can change settings."
        />
      ) : (
        <>
          {state === "conflict" ? (
            <PlumeBanner
              status="error"
              title="Settings changed elsewhere"
              description="Reload the latest settings before saving again."
            />
          ) : null}
          {state === "error" ? (
            <PlumeBanner
              status="error"
              title="Settings save failed"
              description="Try saving again."
            />
          ) : null}
          <PlumeText data-settings-etag="true">ETag: {etag}</PlumeText>
          <section aria-label="Workspace settings fields">
            {Object.entries(settings).map(([key, value]) => (
              <PlumeTextInput key={key} label={key} value={value} isDisabled={state === "saving"} />
            ))}
          </section>
          {onSave ? (
            <PlumeButton
              type="button"
              label={state === "saving" ? "Saving settings…" : "Save settings"}
              variant="primary"
              isDisabled={state === "saving"}
              onClick={() => onSave(settings, etag)}
            />
          ) : null}
          {state === "conflict" && onReloadLatest ? (
            <PlumeButton
              type="button"
              label="Reload latest settings"
              variant="secondary"
              onClick={onReloadLatest}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
