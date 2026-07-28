import { parseCreativeDocument, type CreativeDocument } from "./creative-document.js";

export interface LayoutPlanElement {
  readonly elementId: string;
  readonly elementType: "IMAGE" | "TEXT" | "LOGO" | "CTA" | "SHAPE" | "BACKGROUND";
  readonly slotCode: string;
  readonly assetVersionId?: string | null;
  readonly textValue?: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly style?: Readonly<Record<string, unknown>>;
  readonly constraints?: Readonly<Record<string, unknown>>;
}
export interface LayoutPlan {
  readonly formatProfileId: string;
  readonly templateId: string | null;
  readonly elements: readonly LayoutPlanElement[];
  readonly usedAssetVersionIds: readonly string[];
  readonly copyAssets: Readonly<Record<string, string>>;
  readonly rationale: string;
  readonly riskFlags?: readonly string[];
}
export interface ComposeDocumentInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string | null;
  readonly briefVersionId?: string;
  readonly plan: LayoutPlan;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly template?: Readonly<Record<string, unknown>>;
  readonly safeZones?: readonly Readonly<Record<string, unknown>>[];
}

function numberField(source: Readonly<Record<string, unknown>>, keys: readonly string[]): number {
  for (const key of keys) if (typeof source[key] === "number") return Number(source[key]);
  return 0;
}
function requiredAssetSlots(
  template: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  const slots = template?.requiredAssetSlots ?? template?.requiredSlots;
  return Array.isArray(slots) ? slots.map(String) : [];
}

export function composeCreativeDocument(input: ComposeDocumentInput): CreativeDocument {
  const profileId = String(input.formatProfile.id ?? input.plan.formatProfileId);
  if (profileId !== input.plan.formatProfileId) throw new Error("FORMAT_PROFILE_MISMATCH");
  const width =
    numberField(input.formatProfile, ["width", "canvasWidth"]) ||
    numberField((input.formatProfile.spec as Record<string, unknown> | undefined) ?? {}, ["width"]);
  const height =
    numberField(input.formatProfile, ["height", "canvasHeight"]) ||
    numberField((input.formatProfile.spec as Record<string, unknown> | undefined) ?? {}, [
      "height",
    ]);
  if (!width || !height) throw new Error("FORMAT_DIMENSION_REQUIRED");
  const requiredSlots = requiredAssetSlots(input.template);
  const plannedSlots = new Set(input.plan.elements.map((element) => element.slotCode));
  for (const slot of requiredSlots)
    if (!plannedSlots.has(slot)) throw new Error(`REQUIRED_TEMPLATE_SLOT_MISSING:${slot}`);
  const elements = input.plan.elements.map((element) => ({
    id: element.elementId,
    type: element.elementType,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    zIndex: element.zIndex,
    locked: false,
    visible: true,
    ...(element.assetVersionId === undefined ? {} : { assetVersionId: element.assetVersionId }),
    ...(element.textValue === undefined ? {} : { text: element.textValue }),
    ...(input.plan.copyAssets[element.slotCode]
      ? { text: input.plan.copyAssets[element.slotCode] }
      : {}),
    ...(element.style ? { style: element.style } : {}),
    ...(element.constraints ? { constraints: element.constraints } : {}),
  }));
  const usedAssetVersionIds = [
    ...new Set(
      elements.flatMap((element) =>
        typeof element.assetVersionId === "string" ? [element.assetVersionId] : [],
      ),
    ),
  ].sort();
  return parseCreativeDocument({
    schemaVersion: "1.0.0",
    formatProfileId: profileId,
    layoutTemplateId: input.plan.templateId,
    canvas: {
      width,
      height,
      colorMode: "RGB",
      transparentBackground: Boolean(input.formatProfile.transparentBackground ?? true),
    },
    elements,
    usedAssetVersionIds,
    copyAssets: input.plan.copyAssets,
    ...(input.safeZones ? { safeZones: input.safeZones } : {}),
    metadata: {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      creativeId: input.creativeId,
      productId: input.productId,
      ...(input.briefVersionId ? { briefVersionId: input.briefVersionId } : {}),
    },
  });
}
