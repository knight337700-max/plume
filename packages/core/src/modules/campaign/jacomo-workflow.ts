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
