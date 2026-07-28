import {
  parseCreativeDocument,
  usedAssetVersionIds,
  type CreativeDocument,
  type CreativeElement,
} from "./creative-document.js";

export type EditAction =
  | "MOVE"
  | "RESIZE"
  | "REPLACE_ASSET"
  | "UPDATE_TEXT"
  | "CHANGE_STYLE"
  | "REORDER"
  | "DELETE"
  | "ADD";

export interface EditOperation {
  readonly operationId: string;
  readonly action: EditAction;
  readonly targetIds: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly preconditions?: readonly Readonly<Record<string, unknown>>[];
}

export interface EditOperationBatch {
  readonly operations: readonly EditOperation[];
  readonly summary?: string;
  readonly requiresAssetSelection?: boolean;
  readonly requiresUserConfirmation?: boolean;
}

export interface ApplyEditOperationsOptions {
  readonly expectedRevision?: number;
  readonly currentRevision?: number;
  readonly availableAssetVersionIds?: ReadonlySet<string>;
  readonly requiredTemplateSlots?: ReadonlySet<string>;
  readonly undeletableElementIds?: ReadonlySet<string>;
}

export class EditOperationError extends Error {
  readonly operationId?: string;
  readonly path?: string;

  constructor(message: string, operationId?: string, path?: string) {
    super(message);
    this.name = "EditOperationError";
    this.operationId = operationId;
    this.path = path;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneDocument(document: CreativeDocument): CreativeDocument {
  return JSON.parse(JSON.stringify(document)) as CreativeDocument;
}

function valueAtPath(element: CreativeElement, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!object(value)) return undefined;
    return value[key];
  }, element);
}

function assertPreconditions(element: CreativeElement, operation: EditOperation): void {
  for (const precondition of operation.preconditions ?? []) {
    const path = typeof precondition.path === "string" ? precondition.path : undefined;
    if (!path) throw new EditOperationError("Precondition path is required", operation.operationId);
    const actual = valueAtPath(element, path);
    if (
      Object.prototype.hasOwnProperty.call(precondition, "equals") &&
      actual !== precondition.equals
    )
      throw new EditOperationError(`Precondition failed: ${path}`, operation.operationId, path);
  }
}

function assertPayloadObject(operation: EditOperation): Record<string, unknown> {
  if (!object(operation.payload))
    throw new EditOperationError("Operation payload must be an object", operation.operationId);
  return operation.payload;
}

function assertUnlocked(element: CreativeElement, operation: EditOperation): void {
  if (element.locked)
    throw new EditOperationError(
      `Locked element cannot be changed: ${element.id}`,
      operation.operationId,
    );
}

function patchElement(
  element: CreativeElement,
  operation: EditOperation,
  options: ApplyEditOperationsOptions,
): CreativeElement {
  const payload = assertPayloadObject(operation);
  assertUnlocked(element, operation);
  assertPreconditions(element, operation);
  switch (operation.action) {
    case "MOVE": {
      const x = finite(payload.deltaX) ? element.x + payload.deltaX : payload.x;
      const y = finite(payload.deltaY) ? element.y + payload.deltaY : payload.y;
      if (!finite(x) || !finite(y))
        throw new EditOperationError("MOVE requires x/y or deltaX/deltaY", operation.operationId);
      return { ...element, x, y };
    }
    case "RESIZE": {
      if (
        !finite(payload.width) ||
        !finite(payload.height) ||
        payload.width <= 0 ||
        payload.height <= 0
      )
        throw new EditOperationError(
          "RESIZE requires positive width/height",
          operation.operationId,
        );
      return { ...element, width: payload.width, height: payload.height };
    }
    case "REPLACE_ASSET": {
      const assetVersionId = payload.assetVersionId;
      if (assetVersionId !== null && typeof assetVersionId !== "string")
        throw new EditOperationError(
          "REPLACE_ASSET requires assetVersionId or null",
          operation.operationId,
        );
      if (
        typeof assetVersionId === "string" &&
        options.availableAssetVersionIds &&
        !options.availableAssetVersionIds.has(assetVersionId)
      )
        throw new EditOperationError(
          `Asset version is not available: ${assetVersionId}`,
          operation.operationId,
        );
      return { ...element, assetVersionId };
    }
    case "UPDATE_TEXT":
      if (typeof payload.text !== "string")
        throw new EditOperationError("UPDATE_TEXT requires text", operation.operationId);
      if (element.type !== "TEXT" && element.type !== "CTA")
        throw new EditOperationError(
          `Text is incompatible with ${element.type}`,
          operation.operationId,
        );
      return { ...element, text: payload.text };
    case "CHANGE_STYLE":
      if (!object(payload.style))
        throw new EditOperationError("CHANGE_STYLE requires style", operation.operationId);
      return { ...element, style: { ...(element.style ?? {}), ...payload.style } };
    case "REORDER": {
      const zIndex = finite(payload.zIndex)
        ? payload.zIndex
        : finite(payload.delta)
          ? element.zIndex + payload.delta
          : undefined;
      if (!finite(zIndex))
        throw new EditOperationError("REORDER requires zIndex or delta", operation.operationId);
      return { ...element, zIndex };
    }
    case "DELETE":
      return element;
    case "ADD":
      throw new EditOperationError("ADD cannot target an existing element", operation.operationId);
  }
}

function assertCanvasBounds(document: CreativeDocument, operationId?: string): void {
  for (const element of document.elements) {
    if (
      element.x < 0 ||
      element.y < 0 ||
      element.x + element.width > document.canvas.width ||
      element.y + element.height > document.canvas.height
    )
      throw new EditOperationError(`Element is outside canvas: ${element.id}`, operationId);
  }
}

function assertAssetAccess(
  document: CreativeDocument,
  options: ApplyEditOperationsOptions,
  operationId?: string,
): void {
  if (!options.availableAssetVersionIds) return;
  for (const assetVersionId of usedAssetVersionIds(document))
    if (!options.availableAssetVersionIds.has(assetVersionId))
      throw new EditOperationError(
        `Asset version is not available: ${assetVersionId}`,
        operationId,
      );
}

function assertRequiredSlots(
  document: CreativeDocument,
  options: ApplyEditOperationsOptions,
  operationId?: string,
): void {
  if (!options.requiredTemplateSlots) return;
  const slots = new Set(
    document.elements
      .map((element) => element.textSlotCode)
      .filter((slot): slot is string => Boolean(slot)),
  );
  for (const slot of options.requiredTemplateSlots)
    if (!slots.has(slot))
      throw new EditOperationError(`Required template slot is missing: ${slot}`, operationId);
}

export function applyEditOperations(
  document: CreativeDocument,
  batch: EditOperationBatch,
  options: ApplyEditOperationsOptions = {},
): CreativeDocument {
  if (
    options.expectedRevision !== undefined &&
    options.currentRevision !== options.expectedRevision
  )
    throw new EditOperationError("Creative revision has changed");
  if (!batch.operations.length) throw new EditOperationError("Operation batch must not be empty");

  const draft = cloneDocument(document) as {
    elements: CreativeElement[];
    usedAssetVersionIds: readonly string[];
  };
  for (const operation of batch.operations) {
    if (!operation.operationId || !operation.targetIds.length)
      throw new EditOperationError(
        "Operation id and targetIds are required",
        operation.operationId,
      );
    if (operation.action === "ADD") {
      const payload = assertPayloadObject(operation);
      const candidate = (
        object(payload.element) ? payload.element : payload
      ) as Partial<CreativeElement>;
      const id = typeof candidate.id === "string" ? candidate.id : operation.targetIds[0];
      if (!id || draft.elements.some((element) => element.id === id))
        throw new EditOperationError(`Element id already exists: ${id}`, operation.operationId);
      const added = { ...candidate, id } as CreativeElement;
      if (added.locked === undefined) added.locked = false;
      if (added.visible === undefined) added.visible = true;
      draft.elements.push(
        parseCreativeDocument({ ...draft, elements: [added], usedAssetVersionIds: [] }).elements[0],
      );
      continue;
    }
    const targetIds = new Set(operation.targetIds);
    if (targetIds.size !== operation.targetIds.length)
      throw new EditOperationError("Duplicate targetIds are not allowed", operation.operationId);
    for (const targetId of operation.targetIds) {
      const index = draft.elements.findIndex((element) => element.id === targetId);
      if (index < 0)
        throw new EditOperationError(
          `Target element not found: ${targetId}`,
          operation.operationId,
        );
      if (operation.action === "DELETE") {
        if (options.undeletableElementIds?.has(targetId))
          throw new EditOperationError(
            `Element cannot be deleted: ${targetId}`,
            operation.operationId,
          );
        assertUnlocked(draft.elements[index], operation);
        assertPreconditions(draft.elements[index], operation);
        draft.elements.splice(index, 1);
      } else draft.elements[index] = patchElement(draft.elements[index], operation, options);
    }
    assertCanvasBounds(
      { ...draft, usedAssetVersionIds: [] } as CreativeDocument,
      operation.operationId,
    );
  }
  const used = usedAssetVersionIds(draft);
  const result = parseCreativeDocument({ ...draft, usedAssetVersionIds: used });
  assertCanvasBounds(result);
  assertAssetAccess(result, options);
  assertRequiredSlots(result, options);
  return result;
}
