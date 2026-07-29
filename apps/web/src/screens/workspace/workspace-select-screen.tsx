import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeSkeleton,
  PlumeText,
} from "@plume/ui";

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly role?: string;
}

export type WorkspaceSelectState = "loading" | "ready" | "empty" | "error";

export interface WorkspaceSelectScreenProps {
  workspaces?: readonly WorkspaceOption[];
  state?: WorkspaceSelectState;
  errorMessage?: string;
  onSelect?: (workspace: WorkspaceOption) => void;
  onRetry?: () => void;
}

export function WorkspaceSelectScreen({
  workspaces = [],
  state = "ready",
  errorMessage,
  onSelect,
  onRetry,
}: WorkspaceSelectScreenProps) {
  return (
    <main data-screen-id="WS-01" data-screen-state={state}>
      <section aria-labelledby="workspace-heading">
        <PlumeHeading level={1}>Choose a workspace</PlumeHeading>
        <PlumeText type="supporting">Select a workspace to continue.</PlumeText>
        {state === "loading" ? <PlumeSkeleton aria-label="Loading workspaces" /> : null}
        {state === "error" ? (
          <PlumeBanner status="error" title="Unable to load workspaces" description={errorMessage ?? "Try again."} endContent={onRetry ? <PlumeButton label="Retry" variant="ghost" onClick={onRetry} /> : undefined} />
        ) : null}
        {state === "empty" ? (
          <PlumeEmptyState title="No workspaces available" description="Ask an administrator to invite you to a workspace." />
        ) : null}
        {state === "ready" && workspaces.length > 0 ? (
          <ul aria-label="Available workspaces" data-workspace-list>
            {workspaces.map((workspace) => (
              <li key={workspace.id} data-workspace-id={workspace.id}>
                <PlumeButton
                  type="button"
                  label={workspace.name}
                  variant="secondary"
                  width="100%"
                  onClick={() => onSelect?.(workspace)}
                />
                {workspace.description ? <PlumeText type="supporting">{workspace.description}</PlumeText> : null}
                {workspace.role ? <PlumeBadge label={workspace.role} variant="neutral" /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
