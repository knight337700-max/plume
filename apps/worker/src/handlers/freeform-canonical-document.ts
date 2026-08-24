import {
  type CreativeElement as FreeformElement,
  type CreativeLayoutPlan,
  type FormatProfile,
  type FreeformFontRegistry,
} from "../../../../packages/renderer-vendor/src/public.js";
import {
  FREEFORM_PLUME_FORMAT_PROFILE_ID,
  getKakaoDisplayNative21FormatProfile,
  validateFreeformLayoutEvidence,
  type ConfirmedFreeformCopy,
  type FreeformLayoutEvidenceMetadata,
} from "../../../../packages/infrastructure/src/render/freeform-layout-contract.js";
import {
  parseCreativeDocument,
  type CreativeDocument,
  type CreativeElement,
} from "../../../../packages/core/src/modules/creative/creative-document.js";

export interface FreeformCanonicalDocumentInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string;
  readonly briefVersionId: string;
  readonly assetVersionId: string;
  readonly advertiser: string;
  readonly confirmedCopy: ConfirmedFreeformCopy;
  readonly evidence: FreeformLayoutEvidenceMetadata;
  readonly profile?: FormatProfile;
  readonly fontRegistry?: FreeformFontRegistry;
}

function pixels(value: number, extent: number): number {
  return Number((value * extent).toFixed(6));
}

function metadataFor(element: FreeformElement): Readonly<Record<string, unknown>> {
  return {
    derivedFrom: "FREEFORM_CREATIVE_LAYOUT_PLAN",
    freeformElementId: element.id,
    ...(element.role ? { role: element.role } : {}),
  };
}

function baseElement(
  element: FreeformElement,
  profile: FormatProfile,
): Pick<CreativeElement, "id" | "x" | "y" | "width" | "height" | "zIndex"> &
  Readonly<Pick<CreativeElement, "locked" | "visible" | "metadata">> {
  return {
    id: element.id,
    x: pixels(element.bounds.x, profile.canvas.width),
    y: pixels(element.bounds.y, profile.canvas.height),
    width: pixels(element.bounds.width, profile.canvas.width),
    height: pixels(element.bounds.height, profile.canvas.height),
    zIndex: element.zIndex,
    locked: false,
    visible: true,
    metadata: metadataFor(element),
  };
}

function projectElement(
  element: FreeformElement,
  profile: FormatProfile,
  assetVersionId: string,
): CreativeElement {
  const base = baseElement(element, profile);
  if (element.type === "IMAGE")
    return {
      ...base,
      type: "IMAGE",
      assetVersionId: element.assetId === assetVersionId ? assetVersionId : element.assetId,
      metadata: {
        ...base.metadata,
        placement: element.placement,
      },
    };
  if (element.type === "LOGO")
    return {
      ...base,
      type: "LOGO",
      assetVersionId: element.assetId,
      metadata: {
        ...base.metadata,
        placement: element.placement,
      },
    };
  if (element.type === "SHAPE")
    return {
      ...base,
      type: "SHAPE",
      style: { shape: element.shape, fillColor: element.fillColor },
    };
  return {
    ...base,
    type: "TEXT",
    textSlotCode: element.role ?? null,
    text: element.text,
    style: {
      fontId: element.fontId,
      fontSizePx: element.fontSizePx,
      color: element.color,
      lineHeightPx: element.lineHeightPx,
      textAlign: element.textAlign,
      verticalAlign: element.verticalAlign,
      wrapMode: element.wrapMode,
      overflowMode: element.overflowMode,
      ...(element.letterSpacingPx === undefined
        ? {}
        : { letterSpacingPx: element.letterSpacingPx }),
    },
  };
}

/**
 * Projects the frozen CreativeLayoutPlan into the existing CreativeDocument
 * shape for UI/workflow compatibility. The evidence embedded in metadata is
 * the only authoritative FREEFORM layout input; projected pixel elements are
 * deliberately a derived view and are never consumed by the FREEFORM bridge.
 */
export function createFreeformCanonicalDocument(
  input: FreeformCanonicalDocumentInput,
): CreativeDocument {
  const profile = getKakaoDisplayNative21FormatProfile(input.profile);
  const evidence = validateFreeformLayoutEvidence(input.evidence, {
    expectedRendererAssetId: input.assetVersionId,
    confirmedCopy: input.confirmedCopy,
    profile,
    ...(input.fontRegistry ? { fontRegistry: input.fontRegistry } : {}),
  });
  const plan = evidence.freeformLayoutEvidence.creativeLayoutPlan;
  const image = plan.elements.find((element) => element.type === "IMAGE");
  if (!image || image.assetId !== input.assetVersionId)
    throw new Error("FREEFORM_DOCUMENT_ASSET_IDENTITY_INVALID");
  const elements = plan.elements.map((element) =>
    projectElement(element, profile, input.assetVersionId),
  );
  return parseCreativeDocument({
    schemaVersion: "1.0.0",
    // CreativeDocument carries Plume's public format identity. The persisted
    // evidence carries the frozen Renderer profile identity separately.
    formatProfileId: FREEFORM_PLUME_FORMAT_PROFILE_ID,
    layoutTemplateId: null,
    canvas: {
      width: profile.canvas.width,
      height: profile.canvas.height,
      colorMode: "RGB",
      transparentBackground: false,
      background: plan.background.type === "SOLID" ? plan.background.color : null,
    },
    elements,
    usedAssetVersionIds: [input.assetVersionId],
    copyAssets: {
      advertiser: input.advertiser,
      headline: input.confirmedCopy.headline,
      subcopy: input.confirmedCopy.subcopy,
    },
    metadata: {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      creativeId: input.creativeId,
      productId: input.productId,
      briefVersionId: input.briefVersionId,
      renderMode: "CANONICAL_RENDERER",
      layoutMode: "FREEFORM",
      freeformLayoutEvidence: evidence.freeformLayoutEvidence,
    },
  });
}

export const projectFreeformLayoutToCreativeDocument = createFreeformCanonicalDocument;
