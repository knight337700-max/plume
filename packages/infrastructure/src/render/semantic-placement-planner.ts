// eslint-disable-next-line no-restricted-imports -- Infrastructure composes the Core Agent boundary.
import {
  createAgentOrchestrator,
  validateAgentImageInputs,
  type AgentImageInput,
  type AgentOrchestrator,
  type AgentProviderGateway,
  type JsonSchema,
} from "../../../core/src/public.js";
import {
  inspectImageBytes,
  type ImageInputMetadata,
  type RendererAssetDescriptor,
} from "@plume/renderer-vendor";
import {
  buildSemanticCropCandidate,
  SemanticPlacementError,
  SEMANTIC_IMAGE_SLOT_ID,
  type SemanticCropCandidateBuildResult,
  type SemanticPlacementGeometry,
} from "./semantic-crop-candidate.js";

export const SEMANTIC_PLACEMENT_FORMAT_PROFILE_ID =
  "kakao-moment-bizboard-thumbnail-box-right-1029x258" as const;
export const SEMANTIC_PLACEMENT_RENDERER_PROFILE_ID = "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT" as const;
export const SEMANTIC_PLACEMENT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT" as const;

const normalizedRectSchema: JsonSchema = {
  type: ["object", "null"],
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
    width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
    height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
};

const normalizedPointSchema: JsonSchema = {
  type: ["object", "null"],
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["x", "y"],
  additionalProperties: false,
};

/** The constrained projection is intentionally local and is not a registry schema. */
export const SEMANTIC_PLACEMENT_SCHEMA: JsonSchema = Object.freeze({
  type: "object",
  required: ["formatProfileId", "semanticPlacement", "rationale"],
  additionalProperties: false,
  properties: {
    formatProfileId: { type: "string", minLength: 1 },
    semanticPlacement: {
      type: "object",
      required: ["status", "primarySubjectBounds", "semanticRegion", "focalPoint", "confidence"],
      additionalProperties: false,
      properties: {
        status: { enum: ["FOUND", "NOT_FOUND"] },
        primarySubjectBounds: normalizedRectSchema,
        semanticRegion: normalizedRectSchema,
        focalPoint: normalizedPointSchema,
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    rationale: { type: "string", minLength: 1 },
  },
});

export interface ThumbnailSemanticPlacementAsset {
  readonly assetId: string;
  readonly fileId: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly bytes: Uint8Array;
  readonly checksumSha256: string;
}

export interface ThumbnailSemanticPlacementRequest {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly creativeId: string;
  readonly productId: string;
  readonly asset?: ThumbnailSemanticPlacementAsset;
  readonly assets?: readonly ThumbnailSemanticPlacementAsset[];
  readonly copy?: Readonly<Record<string, string>>;
}

export interface SemanticPlacementPlannerOptions {
  readonly orchestrator?: AgentOrchestrator;
  readonly gateway?: AgentProviderGateway;
}

export interface SemanticPlacementPlannerResult extends SemanticCropCandidateBuildResult {
  readonly imageMetadata: ImageInputMetadata;
  readonly agentOutput: SemanticPlacementAgentOutput;
}

export interface SemanticPlacementAgentOutput {
  readonly formatProfileId: string;
  readonly semanticPlacement: {
    readonly status: "FOUND" | "NOT_FOUND";
    readonly primarySubjectBounds: SemanticPlacementGeometry["primarySubjectBounds"] | null;
    readonly semanticRegion: SemanticPlacementGeometry["semanticRegion"] | null;
    readonly focalPoint: SemanticPlacementGeometry["focalPoint"] | null;
    readonly confidence: number;
  };
  readonly rationale: string;
}

function resolveOrchestrator(options: SemanticPlacementPlannerOptions): AgentOrchestrator {
  if (options.orchestrator) return options.orchestrator;
  if (options.gateway) return createAgentOrchestrator({ gateway: options.gateway });
  throw new Error("SEMANTIC_AGENT_FAILED: an Agent orchestrator is required");
}

function selectedAsset(
  request: ThumbnailSemanticPlacementRequest,
): ThumbnailSemanticPlacementAsset {
  const assets = request.assets ?? (request.asset ? [request.asset] : []);
  if (assets.length === 0)
    throw new SemanticPlacementError(
      "SEMANTIC_IMAGE_INPUT_REQUIRED",
      "One image input is required",
    );
  if (assets.length !== 1)
    throw new SemanticPlacementError(
      "SEMANTIC_IMAGE_CARDINALITY_INVALID",
      "Exactly one image input is required",
    );
  return assets[0]!;
}

function rendererAssetDescriptor(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
): RendererAssetDescriptor {
  return {
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    declaredWidth: metadata.width,
    declaredHeight: metadata.height,
    checksumSha256: asset.checksumSha256,
    assetRef: { type: "INTEGRATION_ASSET_TOKEN", value: asset.fileId },
  };
}

function contextData(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
  request: ThumbnailSemanticPlacementRequest,
): Readonly<Record<string, unknown>> {
  return {
    assets: [
      {
        assetId: asset.assetId,
        fileId: asset.fileId,
        mimeType: asset.mimeType,
        checksumSha256: asset.checksumSha256,
        width: metadata.width,
        height: metadata.height,
        exifOrientation: metadata.exifOrientation,
        hasAlpha: metadata.hasAlpha,
      },
    ],
    template: {
      id: SEMANTIC_PLACEMENT_TEMPLATE_ID,
      layoutMode: "TEMPLATE_LOCKED",
      imageSlot: { id: SEMANTIC_IMAGE_SLOT_ID, x: 666, y: 36, width: 315, height: 186, radius: 12 },
    },
    channel: { code: "KAKAO_MOMENT" },
    formatProfile: {
      id: SEMANTIC_PLACEMENT_FORMAT_PROFILE_ID,
      rendererProfileId: SEMANTIC_PLACEMENT_RENDERER_PROFILE_ID,
    },
    safeZones: ["immutable IMAGE_PRIMARY geometry"],
    copy: request.copy ?? {},
  };
}

const SYSTEM_MESSAGE = [
  "CONSTRAINED_SEMANTIC_PLACEMENT mode.",
  "Analyze only the single provided image and identify the selected PRODUCT.",
  "Return only normalized bounds, semantic region, focal point, confidence, and rationale.",
  "Coordinates use the post-EXIF visual image, top-left origin, normalized 0..1.",
  "Do not choose template or slot geometry; do not return cropRect, CropCandidate, or a final placement plan.",
  "Return NOT_FOUND when the product cannot be identified.",
].join(" ");

function userMessage(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
  productId: string,
): string {
  return [
    `Analyze referenced image fileId=${asset.fileId}.`,
    `The selected product identity is productId=${productId}.`,
    `assetId=${asset.assetId}, mimeType=${asset.mimeType}, checksumSha256=${asset.checksumSha256}.`,
    `oriented dimensions=${metadata.width}x${metadata.height}, exifOrientation=${metadata.exifOrientation}.`,
    "The immutable IMAGE_PRIMARY slot is 315x186 at (666,36) on a 1029x258 canvas; geometry is not an Agent decision.",
  ].join(" ");
}

function asAgentOutput(value: unknown): SemanticPlacementAgentOutput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "Semantic Agent output is not an object",
    );
  const output = value as Partial<SemanticPlacementAgentOutput>;
  if (!output.semanticPlacement || typeof output.semanticPlacement !== "object")
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "Semantic Agent output is missing semanticPlacement",
    );
  if (typeof output.rationale !== "string" || !output.rationale.trim())
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "Semantic Agent rationale is required",
    );
  if (output.formatProfileId !== SEMANTIC_PLACEMENT_FORMAT_PROFILE_ID)
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "Semantic format profile was not derived by Plume",
    );
  const placement = output.semanticPlacement as SemanticPlacementAgentOutput["semanticPlacement"];
  if (placement.status !== "FOUND" && placement.status !== "NOT_FOUND")
    throw new SemanticPlacementError("SEMANTIC_AGENT_FAILED", "Semantic Agent status is invalid");
  return output as SemanticPlacementAgentOutput;
}

export async function planSemanticPlacement(
  request: ThumbnailSemanticPlacementRequest,
  options: SemanticPlacementPlannerOptions,
): Promise<SemanticPlacementPlannerResult> {
  const asset = selectedAsset(request);
  const imageInput: AgentImageInput = {
    fileId: asset.fileId,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    checksumSha256: asset.checksumSha256,
    detail: "high",
  };
  validateAgentImageInputs([imageInput]);
  let metadata: ImageInputMetadata;
  try {
    metadata = await inspectImageBytes(asset.bytes);
  } catch {
    throw new SemanticPlacementError(
      "SEMANTIC_IMAGE_MIME_MISMATCH",
      "Image bytes could not be inspected by the frozen Renderer",
    );
  }
  if (metadata.detectedMimeType !== asset.mimeType)
    throw new SemanticPlacementError(
      "SEMANTIC_IMAGE_MIME_MISMATCH",
      "Declared image MIME does not match frozen Renderer inspection",
    );

  const orchestrator = resolveOrchestrator(options);
  let result: Awaited<ReturnType<AgentOrchestrator["run"]>>;
  try {
    result = await orchestrator.run<SemanticPlacementAgentOutput>({
      taskId: request.taskId,
      agentCode: "LAYOUT_PLANNER",
      workspaceId: request.workspaceId,
      subjectType: "CREATIVE",
      subjectId: request.creativeId,
      correlationId: request.correlationId,
      data: contextData(asset, metadata, request),
      referencedFileIds: [asset.fileId],
      messages: [
        { role: "system", content: SYSTEM_MESSAGE },
        { role: "user", content: userMessage(asset, metadata, request.productId) },
      ],
      outputSchema: SEMANTIC_PLACEMENT_SCHEMA,
      formatProfileId: SEMANTIC_PLACEMENT_FORMAT_PROFILE_ID,
      imageInputs: [imageInput],
    });
  } catch (error) {
    if (error instanceof SemanticPlacementError) throw error;
    throw new SemanticPlacementError("SEMANTIC_AGENT_FAILED", "Semantic Agent invocation failed");
  }
  if (result.status !== "COMPLETED" || result.output === undefined)
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      result.errorCode ?? "Semantic Agent failed",
    );
  const output = asAgentOutput(result.output);
  if (output.semanticPlacement.status === "NOT_FOUND")
    throw new SemanticPlacementError(
      "SEMANTIC_SUBJECT_NOT_FOUND",
      "Semantic Agent did not find a product",
    );
  const placement = output.semanticPlacement;
  if (!placement.primarySubjectBounds)
    throw new SemanticPlacementError(
      "SEMANTIC_SUBJECT_BOUNDS_INVALID",
      "FOUND semantic output is missing primarySubjectBounds",
    );
  if (!placement.semanticRegion)
    throw new SemanticPlacementError(
      "SEMANTIC_REGION_INVALID",
      "FOUND semantic output is missing semanticRegion",
    );
  if (!placement.focalPoint)
    throw new SemanticPlacementError(
      "SEMANTIC_FOCAL_POINT_INVALID",
      "FOUND semantic output is missing focalPoint",
    );
  const built = buildSemanticCropCandidate({
    assetId: asset.assetId,
    assetDescriptor: rendererAssetDescriptor(asset, metadata),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    primarySubjectBounds: placement.primarySubjectBounds,
    semanticRegion: placement.semanticRegion,
    focalPoint: placement.focalPoint,
    confidence: placement.confidence,
    rationale: output.rationale,
    imageSlotId: SEMANTIC_IMAGE_SLOT_ID,
  });
  return Object.freeze({ ...built, imageMetadata: metadata, agentOutput: output });
}

export function createSemanticPlacementPlanner(options: SemanticPlacementPlannerOptions): {
  plan(request: ThumbnailSemanticPlacementRequest): Promise<SemanticPlacementPlannerResult>;
} {
  return { plan: (request) => planSemanticPlacement(request, options) };
}
