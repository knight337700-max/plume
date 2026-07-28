export type CreativeElementType =
  | "IMAGE"
  | "TEXT"
  | "LOGO"
  | "SHAPE"
  | "GROUP"
  | "CTA"
  | "BACKGROUND";
export interface CreativeCanvas {
  readonly width: number;
  readonly height: number;
  readonly colorMode: "RGB";
  readonly transparentBackground: boolean;
  readonly background?: string | null;
}
export interface CreativeElement {
  readonly id: string;
  readonly type: CreativeElementType;
  readonly name?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly opacity?: number;
  readonly zIndex: number;
  readonly locked: boolean;
  readonly visible: boolean;
  readonly assetVersionId?: string | null;
  readonly textSlotCode?: string | null;
  readonly text?: string | null;
  readonly style?: Readonly<Record<string, unknown>>;
  readonly crop?: Readonly<Record<string, unknown>> | null;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface CreativeDocumentMetadata {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string | null;
  readonly briefVersionId?: string;
  readonly sourceVersionId?: string | null;
  readonly [key: string]: unknown;
}
export interface CreativeDocument {
  readonly schemaVersion: "1.0.0";
  readonly formatProfileId: string;
  readonly layoutTemplateId?: string | null;
  readonly canvas: CreativeCanvas;
  readonly elements: readonly CreativeElement[];
  readonly usedAssetVersionIds: readonly string[];
  readonly copyAssets: Readonly<Record<string, string>>;
  readonly safeZones?: readonly Readonly<Record<string, unknown>>[];
  readonly metadata: CreativeDocumentMetadata;
}

export class CreativeDocumentValidationError extends Error {
  readonly paths: readonly string[];
  constructor(paths: readonly string[]) {
    super(`Invalid Creative Document: ${paths.join(", ")}`);
    this.name = "CreativeDocumentValidationError";
    this.paths = Object.freeze([...paths]);
  }
}
const ELEMENT_TYPES = new Set<CreativeElementType>([
  "IMAGE",
  "TEXT",
  "LOGO",
  "SHAPE",
  "GROUP",
  "CTA",
  "BACKGROUND",
]);
const TOP_LEVEL = new Set([
  "schemaVersion",
  "formatProfileId",
  "layoutTemplateId",
  "canvas",
  "elements",
  "usedAssetVersionIds",
  "copyAssets",
  "safeZones",
  "metadata",
]);
const CANVAS_KEYS = new Set([
  "width",
  "height",
  "colorMode",
  "transparentBackground",
  "background",
]);
const ELEMENT_KEYS = new Set([
  "id",
  "type",
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "zIndex",
  "locked",
  "visible",
  "assetVersionId",
  "textSlotCode",
  "text",
  "style",
  "crop",
  "constraints",
  "metadata",
]);
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}`);
}
function required(
  value: Record<string, unknown>,
  key: string,
  errors: string[],
  path: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key}`);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateCreativeDocument(input: unknown): readonly string[] {
  const errors: string[] = [];
  if (!object(input)) return ["$"];
  unknownKeys(input, TOP_LEVEL, "$", errors);
  for (const key of [
    "schemaVersion",
    "formatProfileId",
    "canvas",
    "elements",
    "usedAssetVersionIds",
    "copyAssets",
    "metadata",
  ])
    required(input, key, errors, "$");
  if (input.schemaVersion !== "1.0.0") errors.push("$.schemaVersion");
  if (typeof input.formatProfileId !== "string" || !input.formatProfileId)
    errors.push("$.formatProfileId");
  if (
    input.layoutTemplateId !== undefined &&
    input.layoutTemplateId !== null &&
    typeof input.layoutTemplateId !== "string"
  )
    errors.push("$.layoutTemplateId");
  if (!object(input.canvas)) errors.push("$.canvas");
  else {
    unknownKeys(input.canvas, CANVAS_KEYS, "$.canvas", errors);
    for (const key of ["width", "height", "colorMode", "transparentBackground"])
      required(input.canvas, key, errors, "$.canvas");
    if (!Number.isInteger(input.canvas.width) || Number(input.canvas.width) < 1)
      errors.push("$.canvas.width");
    if (!Number.isInteger(input.canvas.height) || Number(input.canvas.height) < 1)
      errors.push("$.canvas.height");
    if (input.canvas.colorMode !== "RGB") errors.push("$.canvas.colorMode");
    if (typeof input.canvas.transparentBackground !== "boolean")
      errors.push("$.canvas.transparentBackground");
  }
  const elements = Array.isArray(input.elements) ? input.elements : [];
  if (!Array.isArray(input.elements)) errors.push("$.elements");
  const ids = new Set<string>();
  const referenced = new Set<string>();
  for (const [index, value] of elements.entries()) {
    const path = `$.elements[${index}]`;
    if (!object(value)) {
      errors.push(path);
      continue;
    }
    unknownKeys(value, ELEMENT_KEYS, path, errors);
    for (const key of ["id", "type", "x", "y", "width", "height", "zIndex", "locked", "visible"])
      required(value, key, errors, path);
    if (typeof value.id !== "string" || !value.id || ids.has(value.id)) errors.push(`${path}.id`);
    else ids.add(value.id);
    if (typeof value.type !== "string" || !ELEMENT_TYPES.has(value.type as CreativeElementType))
      errors.push(`${path}.type`);
    for (const key of ["x", "y", "zIndex"])
      if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
        errors.push(`${path}.${key}`);
    for (const key of ["width", "height"])
      if (!finitePositive(value[key])) errors.push(`${path}.${key}`);
    if (
      value.opacity !== undefined &&
      (typeof value.opacity !== "number" || value.opacity < 0 || value.opacity > 1)
    )
      errors.push(`${path}.opacity`);
    if (typeof value.locked !== "boolean") errors.push(`${path}.locked`);
    if (typeof value.visible !== "boolean") errors.push(`${path}.visible`);
    if (value.assetVersionId !== undefined && value.assetVersionId !== null) {
      if (typeof value.assetVersionId !== "string") errors.push(`${path}.assetVersionId`);
      else referenced.add(value.assetVersionId);
    }
  }
  if (
    !Array.isArray(input.usedAssetVersionIds) ||
    input.usedAssetVersionIds.some((id) => typeof id !== "string") ||
    new Set(input.usedAssetVersionIds).size !== input.usedAssetVersionIds.length
  )
    errors.push("$.usedAssetVersionIds");
  else if (
    new Set(input.usedAssetVersionIds).size !== referenced.size ||
    [...referenced].some((id) => !input.usedAssetVersionIds.includes(id))
  )
    errors.push("$.usedAssetVersionIds");
  if (
    !object(input.copyAssets) ||
    Object.values(input.copyAssets).some((value) => typeof value !== "string")
  )
    errors.push("$.copyAssets");
  if (
    input.safeZones !== undefined &&
    (!Array.isArray(input.safeZones) || input.safeZones.some((zone) => !object(zone)))
  )
    errors.push("$.safeZones");
  if (!object(input.metadata)) errors.push("$.metadata");
  else
    for (const key of ["workspaceId", "campaignId", "creativeId", "productId"])
      required(input.metadata, key, errors, "$.metadata");
  return Object.freeze(errors);
}

export function parseCreativeDocument(input: unknown): CreativeDocument {
  const errors = validateCreativeDocument(input);
  if (errors.length) throw new CreativeDocumentValidationError(errors);
  return Object.freeze(input as CreativeDocument);
}
export function usedAssetVersionIds(
  document: Pick<CreativeDocument, "elements">,
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        document.elements.flatMap((element) =>
          element.assetVersionId ? [element.assetVersionId] : [],
        ),
      ),
    ].sort(),
  );
}
