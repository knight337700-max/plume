import {
  INTEGRATION_SCHEMA_VERSION,
  OBJECT_RIGHT_IMAGE_SLOT_ID,
  type RendererIntegrationInputV1,
} from "@plume/renderer-vendor";
import type { CanonicalRendererFormatBinding } from "./renderer-bindings.js";

export const OBJECT_RIGHT_PRODUCT_ASSET_ID = "PLUME_OBJECT_RIGHT_PRODUCT" as const;

export interface ObjectRightIntegrationInput {
  readonly advertiser: string;
  readonly headline: string;
  readonly subcopy: string;
  readonly productAsset: {
    readonly token: string;
    readonly mimeType: "image/png" | "image/jpeg";
    readonly checksumSha256: string;
    readonly declaredWidth?: number;
    readonly declaredHeight?: number;
  };
}

export class CanonicalRendererInputError extends Error {
  public readonly code = "CANONICAL_RENDERER_INPUT_INVALID";

  public constructor() {
    super("Canonical Renderer input is invalid");
    this.name = "CanonicalRendererInputError";
  }
}

export function buildObjectRightIntegrationInput(
  binding: CanonicalRendererFormatBinding,
  input: ObjectRightIntegrationInput,
): RendererIntegrationInputV1 {
  if (!/^[a-f0-9]{64}$/iu.test(input.productAsset.checksumSha256))
    throw new CanonicalRendererInputError();
  return {
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
    formatProfileId: binding.rendererFormatProfileId,
    templateId: binding.rendererTemplateId,
    layoutMode: binding.layoutMode,
    copy: {
      advertiser: input.advertiser,
      headline: input.headline,
      subcopy: input.subcopy,
    },
    assets: [
      {
        assetId: OBJECT_RIGHT_PRODUCT_ASSET_ID,
        mimeType: input.productAsset.mimeType,
        checksumSha256: input.productAsset.checksumSha256.toLowerCase(),
        assetRef: {
          type: "INTEGRATION_ASSET_TOKEN",
          value: input.productAsset.token,
        },
        ...(input.productAsset.declaredWidth === undefined
          ? {}
          : { declaredWidth: input.productAsset.declaredWidth }),
        ...(input.productAsset.declaredHeight === undefined
          ? {}
          : { declaredHeight: input.productAsset.declaredHeight }),
      },
    ],
    imagePlacementPlans: [
      {
        schemaVersion: INTEGRATION_SCHEMA_VERSION,
        imageSlotId: OBJECT_RIGHT_IMAGE_SLOT_ID,
        assetId: OBJECT_RIGHT_PRODUCT_ASSET_ID,
        policy: "ALPHA_TRIM_CONTAIN",
        source: "DETERMINISTIC",
        fitMode: "CONTAIN",
        anchor: "CENTER",
        subjectProtection: "NONE",
      },
    ],
    output: { mimeType: "image/png" },
  };
}
