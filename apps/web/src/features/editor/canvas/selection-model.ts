export type SelectionMode = "replace" | "add" | "toggle";

export interface SelectionModel {
  readonly elementIds: readonly string[];
  readonly selectedIds: readonly string[];
  readonly activeId?: string;
}

function unique(ids: readonly string[]) {
  return [...new Set(ids)];
}

function withActiveId(
  elementIds: readonly string[],
  selectedIds: readonly string[],
): SelectionModel {
  const activeId = selectedIds[selectedIds.length - 1];
  return {
    elementIds,
    selectedIds,
    ...(activeId ? { activeId } : {}),
  };
}

export function createSelectionModel(
  elementIds: readonly string[],
  selectedIds: readonly string[] = [],
): SelectionModel {
  const knownIds = unique(elementIds);
  const knownIdSet = new Set(knownIds);
  const validSelectedIds = unique(selectedIds).filter((id) => knownIdSet.has(id));
  return withActiveId(knownIds, validSelectedIds);
}

export function selectElement(
  model: SelectionModel,
  elementId: string,
  mode: SelectionMode = "replace",
): SelectionModel {
  if (!model.elementIds.includes(elementId)) return model;

  if (mode === "replace") {
    return withActiveId(model.elementIds, [elementId]);
  }

  if (mode === "add") {
    return withActiveId(
      model.elementIds,
      model.selectedIds.includes(elementId)
        ? model.selectedIds
        : [...model.selectedIds, elementId],
    );
  }

  const nextSelectedIds = model.selectedIds.includes(elementId)
    ? model.selectedIds.filter((id) => id !== elementId)
    : [...model.selectedIds, elementId];
  return withActiveId(model.elementIds, nextSelectedIds);
}

export function clearSelection(model: SelectionModel): SelectionModel {
  return withActiveId(model.elementIds, []);
}

export function getSelectionHandleIds(model: SelectionModel) {
  return model.selectedIds.filter((id) => model.elementIds.includes(id));
}
