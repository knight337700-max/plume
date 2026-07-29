import {
  CreativeEditorShell,
  PlumeBanner,
  PlumeButton,
  PlumeHeading,
  PlumeText,
  VersionStatusBar,
} from "@plume/ui";
import {
  SceneAdapter,
  type CreativeDocument,
} from "../../features/editor/canvas/scene-adapter.js";
import { ContextInspector } from "../../features/editor/context-inspector.js";
import {
  CreativeListPanel,
  type CreativeListItem,
} from "../../features/editor/creative-list-panel.js";
import {
  useAutosave,
  type AutosaveSaveFunction,
  type AutosaveSnapshot,
} from "../../features/editor/use-autosave.js";

export interface CreativeEditorScreenProps {
  document: CreativeDocument;
  creatives?: readonly CreativeListItem[];
  selectedCreativeId?: string;
  selectedElementIds?: readonly string[];
  revision?: string | number;
  dirty?: boolean;
  saveDocument?: AutosaveSaveFunction<CreativeDocument>;
  autosaveOverride?: AutosaveSnapshot;
  renderState?: "not-started" | "queued" | "rendering" | "ready" | "failed";
  validationState?: "not-run" | "running" | "passed" | "failed";
  onReloadLatest?: () => void;
  onRender?: () => void;
  onCreativeSelect?: (creativeId: string) => void;
  onSelectionChange?: (selectedIds: readonly string[]) => void;
}

function saveStateForBar(state: AutosaveSnapshot["state"]) {
  if (state === "conflict" || state === "error") return "error" as const;
  return state;
}

export function CreativeEditorScreen({
  document,
  creatives = [],
  selectedCreativeId,
  selectedElementIds = [],
  revision = "1",
  dirty = false,
  saveDocument,
  autosaveOverride,
  renderState = "not-started",
  validationState = "not-run",
  onReloadLatest,
  onRender,
  onCreativeSelect,
  onSelectionChange,
}: CreativeEditorScreenProps) {
  const fallbackSave: AutosaveSaveFunction<CreativeDocument> = async (
    _value,
    ifMatch,
  ) => ({ revision: ifMatch ?? revision });
  const autosave = useAutosave({
    value: document,
    revision,
    dirty,
    enabled: Boolean(saveDocument),
    save: saveDocument ?? fallbackSave,
    ...(onReloadLatest ? { onReload: onReloadLatest } : {}),
  });
  const resolvedAutosave = autosaveOverride ?? autosave;
  const selectedElement = document.elements.find(
    (element) => element.id === selectedElementIds[0],
  );

  const toolbar = (
    <div data-editor-toolbar-content>
      <PlumeHeading level={1}>Creative editor</PlumeHeading>
      <PlumeText type="supporting">Document {document.id}</PlumeText>
    </div>
  );
  const footer = (
    <section data-editor-footer-content>
      <VersionStatusBar
        saveState={saveStateForBar(resolvedAutosave.state)}
        renderState={renderState}
        validationState={validationState}
        onSave={() => void resolvedAutosave.retry()}
        {...(resolvedAutosave.revision !== undefined
          ? { revision: resolvedAutosave.revision }
          : {})}
        {...(onRender ? { onRender } : {})}
      />
      {resolvedAutosave.state === "conflict" ? (
        <>
          <PlumeBanner
            status="error"
            title="If-Match conflict"
            description={resolvedAutosave.error ?? "A newer version is available."}
          />
          <div data-plume-region="conflict-recovery-actions">
            <PlumeButton
              type="button"
              label="Reload latest version"
              variant="secondary"
              {...(onReloadLatest ? { onClick: onReloadLatest } : {})}
            />
            <PlumeButton
              type="button"
              label="Retry save"
              variant="primary"
              onClick={() => void resolvedAutosave.retry()}
            />
          </div>
        </>
      ) : null}
    </section>
  );

  return (
    <main
      data-screen-id="EDITOR-01"
      data-screen-state={resolvedAutosave.state}
      data-editor-layout="four-region"
      data-editor-supported-widths="1440,1280"
    >
      <CreativeEditorShell
        toolbar={toolbar}
        creativeList={
          <CreativeListPanel
            items={creatives}
            {...(selectedCreativeId ? { selectedId: selectedCreativeId } : {})}
            {...(onCreativeSelect ? { onSelect: onCreativeSelect } : {})}
          />
        }
        inspector={
          selectedElement ? <ContextInspector element={selectedElement} /> : <ContextInspector />
        }
        footer={footer}
      >
        <div data-editor-canvas="true" data-canvas-min-width="640px">
          <SceneAdapter
            document={document}
            selectedIds={selectedElementIds}
            {...(onSelectionChange ? { onSelectionChange } : {})}
          />
        </div>
      </CreativeEditorShell>
    </main>
  );
}
