import type { CSSProperties } from "react";
import {
  SceneElementRenderer,
  sceneBoundsStyle,
  type SceneBounds,
  type SceneElement,
} from "./element-renderers.js";
import {
  createSelectionModel,
  getSelectionHandleIds,
  selectElement,
  type SelectionMode,
} from "./selection-model.js";

export type { SceneBounds, SceneElement } from "./element-renderers.js";

export interface CreativeDocument {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly backgroundColor?: string;
  readonly elements: readonly SceneElement[];
}

export interface SceneAdapterProps {
  document: CreativeDocument;
  selectedIds?: readonly string[];
  selectionMode?: SelectionMode;
  onSelectionChange?: (selectedIds: readonly string[]) => void;
}

function sceneStyle(document: CreativeDocument): CSSProperties {
  return {
    position: "relative",
    width: document.width,
    height: document.height,
    overflow: "hidden",
    backgroundColor: document.backgroundColor ?? "transparent",
  };
}

function selectionHandleStyle(bounds: SceneBounds): CSSProperties {
  return {
    ...sceneBoundsStyle(bounds),
    pointerEvents: "none",
    border: "2px solid var(--plume-color-accent, #2563eb)",
    boxSizing: "border-box",
  };
}

export function SceneAdapter({
  document,
  selectedIds = [],
  selectionMode = "replace",
  onSelectionChange,
}: SceneAdapterProps) {
  const selectionModel = createSelectionModel(
    document.elements.map((element) => element.id),
    selectedIds,
  );
  const selectedHandleIds = getSelectionHandleIds(selectionModel);
  const selectedHandleSet = new Set(selectedHandleIds);
  const elementById = new Map(document.elements.map((element) => [element.id, element]));

  const handleSelect = (elementId: string) => {
    const nextSelection = selectElement(selectionModel, elementId, selectionMode);
    onSelectionChange?.(nextSelection.selectedIds);
  };

  return (
    <div
      data-plume-feature="scene-adapter"
      data-scene-document-id={document.id}
      data-scene-element-count={String(document.elements.length)}
      data-scene-selection-ids={selectedHandleIds.join(",")}
      style={sceneStyle(document)}
    >
      {document.elements.map((element) => (
        <SceneElementRenderer
          key={element.id}
          element={element}
          isSelected={selectedHandleSet.has(element.id)}
          onSelect={handleSelect}
        />
      ))}
      <div data-plume-region="selection-handles" aria-hidden="true">
        {selectedHandleIds.map((elementId) => {
          const element = elementById.get(elementId);
          return element ? (
            <div
              key={element.id}
              data-selection-handle-for={element.id}
              data-selection-id={element.id}
              style={selectionHandleStyle(element.bounds)}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
