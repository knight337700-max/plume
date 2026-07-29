import {
  PlumeBadge,
  PlumeButton,
  PlumeStatusDot,
  PlumeText,
} from "../components/index.js";

export type VersionSaveState =
  | "saved"
  | "saving"
  | "unsaved"
  | "dirty"
  | "error";

export type VersionRenderState =
  | "not-started"
  | "queued"
  | "rendering"
  | "ready"
  | "failed";

export type VersionValidationState =
  | "not-run"
  | "running"
  | "passed"
  | "failed";

export interface VersionStatusBarProps {
  saveState: VersionSaveState;
  revision?: string | number;
  renderState: VersionRenderState;
  validationState: VersionValidationState;
  onSave?: () => void;
  onRender?: () => void;
}

type StatusVariant = "success" | "warning" | "error" | "accent" | "neutral";
type BadgeStatusVariant = "success" | "warning" | "error" | "info" | "neutral";

const saveStateLabels: Record<VersionSaveState, string> = {
  saved: "Saved",
  saving: "Saving",
  unsaved: "Unsaved changes",
  dirty: "Unsaved changes",
  error: "Save failed",
};

const renderStateLabels: Record<VersionRenderState, string> = {
  "not-started": "Not rendered",
  queued: "Render queued",
  rendering: "Rendering",
  ready: "Rendered",
  failed: "Render failed",
};

const validationStateLabels: Record<VersionValidationState, string> = {
  "not-run": "Not validated",
  running: "Validating",
  passed: "Valid",
  failed: "Validation failed",
};

function saveVariant(state: VersionSaveState): StatusVariant {
  if (state === "saved") return "success";
  if (state === "saving" || state === "unsaved" || state === "dirty") return "warning";
  return "error";
}

function renderVariant(state: VersionRenderState): StatusVariant {
  if (state === "ready") return "success";
  if (state === "queued" || state === "rendering") return "accent";
  if (state === "failed") return "error";
  return "neutral";
}

function validationVariant(state: VersionValidationState): StatusVariant {
  if (state === "passed") return "success";
  if (state === "running") return "accent";
  if (state === "failed") return "error";
  return "neutral";
}

function badgeVariant(state: StatusVariant): BadgeStatusVariant {
  return state === "accent" ? "info" : state;
}

export function VersionStatusBar({
  saveState,
  revision,
  renderState,
  validationState,
  onSave,
  onRender,
}: VersionStatusBarProps) {
  const saveLabel = saveStateLabels[saveState];
  const renderLabel = renderStateLabels[renderState];
  const validationLabel = validationStateLabels[validationState];

  return (
    <section
      role="status"
      aria-live="polite"
      data-plume-component="version-status-bar"
    >
      <div data-status-key="save">
        <PlumeStatusDot
          variant={saveVariant(saveState)}
          label={saveLabel}
          {...(saveState === "saving" ? { isPulsing: true } : {})}
        />
        <PlumeText>{saveLabel}</PlumeText>
        <PlumeBadge
          label={saveLabel}
          variant={badgeVariant(saveVariant(saveState))}
        />
        {onSave && saveState !== "saving" ? (
          <PlumeButton
            type="button"
            label="Save version"
            variant="secondary"
            size="sm"
            onClick={onSave}
          />
        ) : null}
      </div>

      <div data-status-key="revision">
        <PlumeText type="supporting">
          Revision {revision === undefined ? "—" : revision}
        </PlumeText>
      </div>

      <div data-status-key="render">
        <PlumeStatusDot
          variant={renderVariant(renderState)}
          label={renderLabel}
          {...(renderState === "rendering" ? { isPulsing: true } : {})}
        />
        <PlumeText>{renderLabel}</PlumeText>
        <PlumeBadge
          label={renderLabel}
          variant={badgeVariant(renderVariant(renderState))}
        />
        {onRender && renderState !== "rendering" ? (
          <PlumeButton
            type="button"
            label="Render version"
            variant="ghost"
            size="sm"
            onClick={onRender}
          />
        ) : null}
      </div>

      <div data-status-key="validation">
        <PlumeStatusDot
          variant={validationVariant(validationState)}
          label={validationLabel}
          {...(validationState === "running" ? { isPulsing: true } : {})}
        />
        <PlumeText>{validationLabel}</PlumeText>
        <PlumeBadge
          label={validationLabel}
          variant={badgeVariant(validationVariant(validationState))}
        />
      </div>
    </section>
  );
}
