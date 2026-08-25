import { randomUUID } from "node:crypto";
import { composeCreativeDocument } from "../creative/compose-document.js";
import type { CreativeDocument } from "../creative/creative-document.js";

export interface JacomoCreativeInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly productId: string;
  readonly formatProfileId: string;
  readonly sequence: number;
}

export interface JacomoCanonicalCreativeInput extends JacomoCreativeInput {
  readonly briefVersionId: string;
  readonly assetVersionId: string;
  readonly advertiser: string;
  readonly headline: string;
  readonly subcopy: string;
  readonly creativeId?: string;
  readonly creativeVersionId?: string;
  readonly templateId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface JacomoCreativeOutput {
  readonly creativeId: string;
  readonly creativeVersionId: string;
  readonly document: CreativeDocument;
  readonly outputProfile: {
    readonly mimeType: "image/png";
    readonly width: number;
    readonly height: number;
    readonly transparentBackground: boolean;
  };
}

/**
 * The JACOMO MVP application service creates a deterministic, reviewable creative
 * document. It owns document composition; Worker adapters only provide queue,
 * storage, and model ports.
 */
export function composeJacomoCreative(input: JacomoCreativeInput): JacomoCreativeOutput {
  const creativeId = randomUUID();
  const creativeVersionId = randomUUID();
  const width = 1029;
  const height = 258;
  const formatProfile = {
    id: input.formatProfileId,
    width,
    height,
    transparentBackground: false,
  };
  const document = composeCreativeDocument({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    creativeId,
    productId: input.productId,
    plan: {
      formatProfileId: input.formatProfileId,
      templateId: null,
      elements: [
        {
          elementId: `background-${input.sequence}`,
          elementType: "BACKGROUND",
          slotCode: "background",
          x: 0,
          y: 0,
          width,
          height,
          zIndex: 0,
          style: { fill: input.sequence % 2 === 0 ? "#e8eef7" : "#f5e8e1" },
        },
        {
          elementId: `product-${input.sequence}`,
          elementType: "TEXT",
          slotCode: "product-name",
          textValue: `JACOMO ${input.productId.slice(0, 8).toUpperCase()}`,
          x: 60,
          y: 68,
          width: 720,
          height: 80,
          zIndex: 1,
          style: { fill: "#1f2937" },
        },
        {
          elementId: `cta-${input.sequence}`,
          elementType: "CTA",
          slotCode: "cta",
          textValue: "MOCK AI CREATIVE",
          x: 760,
          y: 88,
          width: 220,
          height: 56,
          zIndex: 2,
          style: { fill: "#334155" },
        },
      ],
      usedAssetVersionIds: [],
      copyAssets: {},
      rationale: "Deterministic JACOMO staging composition",
    },
    formatProfile,
  });
  return {
    creativeId,
    creativeVersionId,
    document,
    outputProfile: { mimeType: "image/png", width, height, transparentBackground: false },
  };
}

/**
 * Compose the deterministic Product Workflow document used by the canonical
 * Object Right path.  Geometry here is only the required semantic document
 * representation; the TEMPLATE_LOCKED Renderer remains the placement source
 * of truth.
 */
export function composeJacomoCanonicalCreative(
  input: JacomoCanonicalCreativeInput,
): JacomoCreativeOutput {
  const creativeId = input.creativeId ?? randomUUID();
  const creativeVersionId = input.creativeVersionId ?? randomUUID();
  const width = 1029;
  const height = 258;
  const formatProfile = {
    id: input.formatProfileId,
    width,
    height,
    transparentBackground: false,
  };
  const document = composeCreativeDocument({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
    creativeId,
    productId: input.productId,
    briefVersionId: input.briefVersionId,
    metadata: { ...(input.metadata ?? {}), renderMode: "CANONICAL_RENDERER" },
    plan: {
      formatProfileId: input.formatProfileId,
      templateId: input.templateId ?? "KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1",
      elements: [
        {
          elementId: `product-${input.sequence}`,
          elementType: "IMAGE",
          slotCode: "product",
          assetVersionId: input.assetVersionId,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          zIndex: 0,
          locked: true,
          visible: true,
        },
        {
          elementId: `headline-${input.sequence}`,
          elementType: "TEXT",
          slotCode: "headline",
          textValue: input.headline,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          zIndex: 1,
          locked: true,
          visible: true,
        },
        {
          elementId: `subcopy-${input.sequence}`,
          elementType: "TEXT",
          slotCode: "subcopy",
          textValue: input.subcopy,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          zIndex: 2,
          locked: true,
          visible: true,
        },
      ],
      usedAssetVersionIds: [input.assetVersionId],
      copyAssets: {
        advertiser: input.advertiser,
        headline: input.headline,
        subcopy: input.subcopy,
      },
      rationale: "Confirmed Brief copy and selected Product asset",
    },
    formatProfile,
  });
  return {
    creativeId,
    creativeVersionId,
    document,
    outputProfile: { mimeType: "image/png", width, height, transparentBackground: false },
  };
}
