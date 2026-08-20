import {
  INTEGRATION_SCHEMA_VERSION,
  THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID,
  type CropCandidate,
  type ImagePlacementPlan,
  type RendererIntegrationInputV1,
} from "@plume/renderer-vendor";
import type { CanonicalRendererFormatBinding } from "./renderer-bindings.js";

export interface ThumbnailBoxRightIntegrationInput {
  readonly advertiser: string;
  readonly headline: string;
  readonly subcopy: string;
  readonly productAsset: {
    readonly token: string;
    readonly mimeType: "image/png" | "image/jpeg";
    readonly checksumSha256: string;
    readonly declaredWidth: number;
    readonly declaredHeight: number;
  };
  readonly cropCandidate: CropCandidate;
  readonly acceptedPlan: ImagePlacementPlan;
}

export function buildThumbnailBoxRightIntegrationInput(
  binding: CanonicalRendererFormatBinding,
  input: ThumbnailBoxRightIntegrationInput,
): RendererIntegrationInputV1 {
  if (binding.rendererFormatProfileId !== "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT")
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_BINDING_INVALID");
  if (input.cropCandidate.imageSlotId !== THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID)
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_SLOT_INVALID");
  if (input.acceptedPlan.imageSlotId !== THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID)
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_SLOT_INVALID");
  if (input.acceptedPlan.cropCandidateId !== input.cropCandidate.candidateId)
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_CANDIDATE_LINK_INVALID");
  if (input.acceptedPlan.assetId !== input.cropCandidate.assetId)
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_ASSET_LINK_INVALID");
  if (!/^[a-f0-9]{64}$/iu.test(input.productAsset.checksumSha256))
    throw new Error("CANONICAL_RENDERER_THUMBNAIL_CHECKSUM_INVALID");
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
        assetId: input.acceptedPlan.assetId,
        mimeType: input.productAsset.mimeType,
        checksumSha256: input.productAsset.checksumSha256.toLowerCase(),
        declaredWidth: input.productAsset.declaredWidth,
        declaredHeight: input.productAsset.declaredHeight,
        assetRef: { type: "INTEGRATION_ASSET_TOKEN", value: input.productAsset.token },
      },
    ],
    imagePlacementPlans: [input.acceptedPlan],
    cropCandidates: [input.cropCandidate],
    output: { mimeType: "image/png" },
  };
}
