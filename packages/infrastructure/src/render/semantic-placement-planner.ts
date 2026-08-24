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
  normalizedRectToPixelRect,
  type ImageInputMetadata,
  type NormalizedRect,
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
  readonly asset: ThumbnailSemanticPlacementAsset;
  readonly productName?: string;
  readonly copy?: Readonly<Record<string, string>>;
}

/**
 * The additive FREEFORM target contract.  The full layout Agent owns the
 * normalized bounds; this constrained Agent only receives the selected image
 * slot and returns product geometry for that slot.
 */
export interface FreeformSemanticPlacementTarget {
  readonly normalizedBounds: NormalizedRect;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly plumeFormatProfileId: string;
  readonly rendererFormatProfileId: string;
}

export interface FreeformSemanticPlacementRequest {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly correlationId: string;
  readonly creativeId: string;
  readonly productId: string;
  readonly asset: ThumbnailSemanticPlacementAsset;
  readonly target: FreeformSemanticPlacementTarget;
  readonly productName?: string;
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

interface SemanticTargetContext {
  readonly layoutMode: "TEMPLATE_LOCKED" | "FREEFORM";
  readonly expectedFormatProfileId: string;
  readonly rendererFormatProfileId: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly buildUserMessage: (
    asset: ThumbnailSemanticPlacementAsset,
    metadata: ImageInputMetadata,
    request: ThumbnailSemanticPlacementRequest | FreeformSemanticPlacementRequest,
  ) => string;
  readonly targetPixelWidth?: number;
  readonly targetPixelHeight?: number;
}

function assetContext(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
): Record<string, unknown> {
  return {
    assetId: asset.assetId,
    fileId: asset.fileId,
    mimeType: asset.mimeType,
    checksumSha256: asset.checksumSha256,
    width: metadata.width,
    height: metadata.height,
    exifOrientation: metadata.exifOrientation,
    hasAlpha: metadata.hasAlpha,
  };
}

function contextData(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
  request: ThumbnailSemanticPlacementRequest | FreeformSemanticPlacementRequest,
  target: SemanticTargetContext,
): Readonly<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    assets: [assetContext(asset, metadata)],
    formatProfile: {
      id: target.expectedFormatProfileId,
      rendererProfileId: target.rendererFormatProfileId,
    },
    safeZones: ["immutable IMAGE_PRIMARY geometry"],
    ...(request.productName
      ? { selectedProduct: { id: request.productId, name: request.productName } }
      : {}),
    copy: request.copy ?? {},
    ...target.context,
  };
  return context;
}

const SYSTEM_MESSAGE = [
  "CONSTRAINED_SEMANTIC_PLACEMENT mode.",
  "Analyze only the single provided image and identify the selected PRODUCT.",
  "Return only normalized bounds, semantic region, focal point, confidence, and rationale.",
  "Coordinates use the post-EXIF visual image, top-left origin, normalized 0..1.",
  "Do not choose template or slot geometry; do not return cropRect, CropCandidate, or a final placement plan.",
  "Return NOT_FOUND when the product cannot be identified.",
].join(" ");

const FREEFORM_SYSTEM_MESSAGE = [
  SYSTEM_MESSAGE,
  "FREEFORM semantic reintegration mode.",
  "Analyze only the selected PRODUCT inside the provided IMAGE_PRIMARY target slot.",
  "The target slot and all element/layout/copy geometry are immutable context, not Agent decisions.",
  "Do not move, resize, reorder, or rewrite any layout element or confirmed copy.",
  "Do not generate cropRect, CropCandidate, or a final placement plan.",
].join(" ");

function userMessage(
  asset: ThumbnailSemanticPlacementAsset,
  metadata: ImageInputMetadata,
  productId: string,
  productName?: string,
  target?: FreeformSemanticPlacementTarget,
): string {
  if (target) {
    return [
      `Analyze referenced image fileId=${asset.fileId}.`,
      `The selected product identity is productId=${productId}.`,
      ...(productName ? [`The selected product name is productName=${productName}.`] : []),
      `assetId=${asset.assetId}, mimeType=${asset.mimeType}, checksumSha256=${asset.checksumSha256}.`,
      `oriented dimensions=${metadata.width}x${metadata.height}, exifOrientation=${metadata.exifOrientation}.`,
      `layoutMode=FREEFORM; canvas=${target.canvasWidth}x${target.canvasHeight}.`,
      `The immutable IMAGE_PRIMARY target image element has normalizedBounds=${JSON.stringify(target.normalizedBounds)}, pixelBounds=${target.pixelWidth}x${target.pixelHeight}.`,
      `formatProfileId=${target.plumeFormatProfileId}, rendererProfileId=${target.rendererFormatProfileId}.`,
      "Return only PRODUCT primarySubjectBounds, semanticRegion, focalPoint, confidence, and rationale.",
      "Do not return cropRect, CropCandidate, final placement, element bounds, text layout, or copy changes.",
    ].join(" ");
  }
  return [
    `Analyze referenced image fileId=${asset.fileId}.`,
    `The selected product identity is productId=${productId}.`,
    ...(productName ? [`The selected product name is productName=${productName}.`] : []),
    `assetId=${asset.assetId}, mimeType=${asset.mimeType}, checksumSha256=${asset.checksumSha256}.`,
    `oriented dimensions=${metadata.width}x${metadata.height}, exifOrientation=${metadata.exifOrientation}.`,
    "The immutable IMAGE_PRIMARY slot is 315x186 at (666,36) on a 1029x258 canvas; geometry is not an Agent decision.",
  ].join(" ");
}

function asAgentOutput(
  value: unknown,
  expectedFormatProfileId: string,
): SemanticPlacementAgentOutput {
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
  if (output.formatProfileId !== expectedFormatProfileId)
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "Semantic format profile was not derived by Plume",
    );
  const placement = output.semanticPlacement as SemanticPlacementAgentOutput["semanticPlacement"];
  if (placement.status !== "FOUND" && placement.status !== "NOT_FOUND")
    throw new SemanticPlacementError("SEMANTIC_AGENT_FAILED", "Semantic Agent status is invalid");
  return output as SemanticPlacementAgentOutput;
}

async function planSemanticPlacementInternal(
  request: ThumbnailSemanticPlacementRequest | FreeformSemanticPlacementRequest,
  options: SemanticPlacementPlannerOptions,
  target: SemanticTargetContext,
): Promise<SemanticPlacementPlannerResult> {
  const legacyAssets = (request as unknown as { readonly assets?: unknown }).assets;
  if (legacyAssets !== undefined)
    throw new SemanticPlacementError(
      Array.isArray(legacyAssets) && legacyAssets.length === 0
        ? "SEMANTIC_IMAGE_INPUT_REQUIRED"
        : "SEMANTIC_IMAGE_CARDINALITY_INVALID",
      "The semantic planner accepts exactly one required asset field",
    );
  const asset = request.asset;
  if (!asset)
    throw new SemanticPlacementError(
      "SEMANTIC_IMAGE_INPUT_REQUIRED",
      "One image input is required",
    );
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
      data: contextData(asset, metadata, request, target),
      referencedFileIds: [asset.fileId],
      messages: [
        {
          role: "system",
          content: target.layoutMode === "FREEFORM" ? FREEFORM_SYSTEM_MESSAGE : SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: target.buildUserMessage(asset, metadata, request),
        },
      ],
      outputSchema: SEMANTIC_PLACEMENT_SCHEMA,
      formatProfileId: target.expectedFormatProfileId,
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
  const output = asAgentOutput(result.output, target.expectedFormatProfileId);
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
    ...(target.targetPixelWidth === undefined || target.targetPixelHeight === undefined
      ? {}
      : {
          targetPixelWidth: target.targetPixelWidth,
          targetPixelHeight: target.targetPixelHeight,
        }),
  });
  return Object.freeze({ ...built, imageMetadata: metadata, agentOutput: output });
}

export async function planSemanticPlacement(
  request: ThumbnailSemanticPlacementRequest,
  options: SemanticPlacementPlannerOptions,
): Promise<SemanticPlacementPlannerResult> {
  return planSemanticPlacementInternal(request, options, {
    layoutMode: "TEMPLATE_LOCKED",
    expectedFormatProfileId: SEMANTIC_PLACEMENT_FORMAT_PROFILE_ID,
    rendererFormatProfileId: SEMANTIC_PLACEMENT_RENDERER_PROFILE_ID,
    context: {
      template: {
        id: SEMANTIC_PLACEMENT_TEMPLATE_ID,
        layoutMode: "TEMPLATE_LOCKED",
        imageSlot: {
          id: SEMANTIC_IMAGE_SLOT_ID,
          x: 666,
          y: 36,
          width: 315,
          height: 186,
          radius: 12,
        },
      },
      channel: { code: "KAKAO_MOMENT" },
    },
    buildUserMessage: (asset, metadata, semanticRequest) =>
      userMessage(asset, metadata, semanticRequest.productId, semanticRequest.productName),
  });
}

function samePixelDimensions(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number },
): boolean {
  return left.width === right.width && left.height === right.height;
}

function validateFreeformTarget(target: FreeformSemanticPlacementTarget): void {
  if (
    !Number.isInteger(target.canvasWidth) ||
    !Number.isInteger(target.canvasHeight) ||
    target.canvasWidth <= 0 ||
    target.canvasHeight <= 0 ||
    !Number.isInteger(target.pixelWidth) ||
    !Number.isInteger(target.pixelHeight) ||
    target.pixelWidth <= 0 ||
    target.pixelHeight <= 0
  )
    throw new SemanticPlacementError(
      "SEMANTIC_CROP_REGION_UNFIT",
      "FREEFORM target canvas and slot dimensions must be positive integers",
    );
  if (!target.plumeFormatProfileId.trim() || !target.rendererFormatProfileId.trim())
    throw new SemanticPlacementError(
      "SEMANTIC_AGENT_FAILED",
      "FREEFORM target format profile identities are required",
    );
  let pixelBounds;
  try {
    pixelBounds = normalizedRectToPixelRect(
      target.normalizedBounds,
      target.canvasWidth,
      target.canvasHeight,
    );
  } catch {
    throw new SemanticPlacementError(
      "SEMANTIC_CROP_REGION_UNFIT",
      "FREEFORM target normalized bounds are invalid",
    );
  }
  if (
    !samePixelDimensions(pixelBounds, {
      width: target.pixelWidth,
      height: target.pixelHeight,
    })
  )
    throw new SemanticPlacementError(
      "SEMANTIC_CROP_REGION_UNFIT",
      "FREEFORM target pixel dimensions drift from normalized bounds",
    );
}

export async function planFreeformSemanticPlacement(
  request: FreeformSemanticPlacementRequest,
  options: SemanticPlacementPlannerOptions,
): Promise<SemanticPlacementPlannerResult> {
  validateFreeformTarget(request.target);
  return planSemanticPlacementInternal(request, options, {
    layoutMode: "FREEFORM",
    expectedFormatProfileId: request.target.plumeFormatProfileId,
    rendererFormatProfileId: request.target.rendererFormatProfileId,
    context: {
      layoutMode: "FREEFORM",
      canvas: {
        width: request.target.canvasWidth,
        height: request.target.canvasHeight,
      },
      targetImageElement: {
        id: SEMANTIC_IMAGE_SLOT_ID,
        role: "PRIMARY_IMAGE",
        normalizedBounds: request.target.normalizedBounds,
        pixelWidth: request.target.pixelWidth,
        pixelHeight: request.target.pixelHeight,
        pixelBounds: {
          width: request.target.pixelWidth,
          height: request.target.pixelHeight,
        },
      },
      selectedProduct: { id: request.productId },
    },
    targetPixelWidth: request.target.pixelWidth,
    targetPixelHeight: request.target.pixelHeight,
    buildUserMessage: (asset, metadata, semanticRequest) =>
      userMessage(
        asset,
        metadata,
        semanticRequest.productId,
        semanticRequest.productName,
        request.target,
      ),
  });
}

export function createFreeformSemanticPlacementPlanner(options: SemanticPlacementPlannerOptions): {
  plan(request: FreeformSemanticPlacementRequest): Promise<SemanticPlacementPlannerResult>;
} {
  return { plan: (request) => planFreeformSemanticPlacement(request, options) };
}

export function createSemanticPlacementPlanner(options: SemanticPlacementPlannerOptions): {
  plan(request: ThumbnailSemanticPlacementRequest): Promise<SemanticPlacementPlannerResult>;
} {
  return { plan: (request) => planSemanticPlacement(request, options) };
}
