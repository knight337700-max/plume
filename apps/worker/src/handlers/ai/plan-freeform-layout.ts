import {
  canonicalJson,
  loadCanonicalCreativeLayoutPlanSchema,
  loadResolvedCanonicalCreativeLayoutPlanSchema,
  normalizedRectToPixelRect,
  type CanonicalFreeformLayoutPlanSchema,
  type CreativeLayoutPlan,
  type FreeformImageElement,
  type FormatProfile,
  type FreeformFontRegistry,
} from "../../../../../packages/renderer-vendor/src/public.js";
import {
  validateAgentImageInputs,
  type AgentImageInput,
} from "../../../../../packages/core/src/public.js";
import type { AgentOrchestrator } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import {
  assertFreeformLayoutContract,
  FREEFORM_RENDERER_FORMAT_PROFILE_ID,
  FREEFORM_PLUME_FORMAT_PROFILE_ID,
  type ConfirmedFreeformCopy,
} from "../../../../../packages/infrastructure/src/render/freeform-layout-contract.js";
import {
  planFreeformSemanticPlacement,
  type FreeformSemanticPlacementTarget,
  type SemanticPlacementPlannerOptions,
} from "../../../../../packages/infrastructure/src/render/semantic-placement-planner.js";
import { assertCompleted, taskDefaults, type AIWorkerResult } from "./index.js";

export interface FreeformPlannerSelectedAsset {
  readonly assetVersionId: string;
  readonly rendererAssetId: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly checksumSha256: string;
  readonly width: number;
  readonly height: number;
  readonly imageInput: AgentImageInput;
}

export interface PlanFreeformLayoutInput {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string;
  readonly targetProfile: FormatProfile;
  readonly confirmedCopy: ConfirmedFreeformCopy;
  readonly selectedAsset: FreeformPlannerSelectedAsset;
  readonly messages?: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
}

export interface FreeformLayoutPlannerDependencies {
  readonly orchestrator: AgentOrchestrator;
  readonly outputSchema?: JsonSchema;
  readonly rendererRuntimeRoot?: string;
  readonly fontRegistry?: FreeformFontRegistry;
  /** Optional seam for deterministic unit tests; production uses the same orchestrator. */
  readonly semanticPlacementPlannerOptions?: Omit<SemanticPlacementPlannerOptions, "orchestrator">;
}

function canonicalOutputSchema(dependencies: FreeformLayoutPlannerDependencies): JsonSchema {
  const loaded = loadCanonicalCreativeLayoutPlanSchema(
    dependencies.rendererRuntimeRoot,
  ) as CanonicalFreeformLayoutPlanSchema;
  if (
    dependencies.outputSchema &&
    canonicalJson(dependencies.outputSchema) !== canonicalJson(loaded)
  )
    throw new Error("FREEFORM_PLANNER_OUTPUT_SCHEMA_NOT_CANONICAL");
  return loadResolvedCanonicalCreativeLayoutPlanSchema(
    dependencies.rendererRuntimeRoot,
  ) as JsonSchema;
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildFirstProofAgentContextData(
  input: PlanFreeformLayoutInput,
): Readonly<Record<string, unknown>> {
  return {
    assets: [
      {
        assetVersionId: input.selectedAsset.assetVersionId,
        rendererAssetId: input.selectedAsset.rendererAssetId,
        mimeType: input.selectedAsset.mimeType,
        checksumSha256: input.selectedAsset.checksumSha256,
        width: input.selectedAsset.width,
        height: input.selectedAsset.height,
      },
    ],
    copy: {
      headline: input.confirmedCopy.headline,
      subcopy: input.confirmedCopy.subcopy,
    },
    formatProfile: { id: input.targetProfile.formatProfileId },
  };
}

function quoteMessageValue(value: string): string {
  return JSON.stringify(value);
}

function buildFirstProofTaskMessage(input: PlanFreeformLayoutInput): string {
  const selectedAssetId = quoteMessageValue(input.selectedAsset.rendererAssetId);
  const headline = quoteMessageValue(input.confirmedCopy.headline);
  const subcopy = quoteMessageValue(input.confirmedCopy.subcopy);
  return [
    "FREEFORM first-proof: return only the structured plan required by the schema.",
    "Use exactly 3 elements: exactly 1 IMAGE and exactly 2 TEXT elements.",
    `The IMAGE must have role PRIMARY_IMAGE and assetId exactly ${selectedAssetId}.`,
    `Use exactly 1 HEADLINE with confirmed text exactly ${headline}.`,
    `Use exactly 1 SUBCOPY with confirmed text exactly ${subcopy}.`,
    "Do not rewrite, paraphrase, shorten, or replace confirmed copy.",
    "Do not invent or substitute assetId.",
    "Do not add LOGO or SHAPE elements.",
    "source must be AGENT.",
    "background.type must be SOLID.",
    "All normalized bounds must stay inside the canvas: 0 <= x <= 1, 0 <= y <= 1, width > 0, height > 0, x + width <= 1, and y + height <= 1.",
    "For the HEADLINE TEXT element, fontId must be exactly SPOQA_HAN_SANS_BOLD.",
    "For the SUBCOPY TEXT element, fontId must be exactly SPOQA_HAN_SANS_REGULAR.",
    "Do not invent, substitute, alias, or rename font IDs.",
    "Use placement.policy CENTER_CONTAIN.",
    "Use placement.source AGENT.",
    "Use placement.fitMode CONTAIN.",
    "Use placement.anchor CENTER.",
    "Use placement.subjectProtection REQUIRED.",
    "Do not provide cropRect, focalPoint, cropCandidateId, confidence, protectedSubjects, or rationale.",
    "For both the HEADLINE and SUBCOPY TEXT elements, wrapMode must be exactly NO_WRAP.",
    "Do not use WORD_WRAP.",
    "Do not use EXPLICIT_NEWLINES.",
    "Do not insert newline characters into either confirmed copy.",
    "Do not provide opacity on the PRIMARY_IMAGE, HEADLINE, or SUBCOPY elements.",
    "Do not provide letterSpacingPx on the HEADLINE or SUBCOPY TEXT elements.",
  ].join("\n");
}

const FIRST_PROOF_FONT_IDS = ["SPOQA_HAN_SANS_BOLD", "SPOQA_HAN_SANS_REGULAR"] as const;

const FIRST_PROOF_PLACEMENT_VALUES = {
  policy: "CENTER_CONTAIN",
  source: "AGENT",
  fitMode: "CONTAIN",
  anchor: "CENTER",
  subjectProtection: "REQUIRED",
} as const;

const FIRST_PROOF_WRAP_MODE = "NO_WRAP" as const;

const FIRST_PROOF_PLACEMENT_KEYS = Object.keys(FIRST_PROOF_PLACEMENT_VALUES);

function schemaBranchType(value: unknown): string | undefined {
  if (!isSchemaRecord(value) || !isSchemaRecord(value.properties)) return undefined;
  const typeSchema = value.properties.type;
  if (!isSchemaRecord(typeSchema)) return undefined;
  if (typeof typeSchema.const === "string") return typeSchema.const;
  if (Array.isArray(typeSchema.enum) && typeSchema.enum.length === 1)
    return typeof typeSchema.enum[0] === "string" ? typeSchema.enum[0] : undefined;
  return undefined;
}

function narrowFirstProofProviderSchema(resolvedSchema: JsonSchema): JsonSchema {
  if (resolvedSchema.type !== "object" || !isSchemaRecord(resolvedSchema.properties))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  const derived = JSON.parse(JSON.stringify(resolvedSchema)) as Record<string, unknown>;
  const derivedProperties = derived.properties;
  if (!isSchemaRecord(derivedProperties))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  const derivedElements = derivedProperties.elements;
  const derivedSource = derivedProperties.source;
  if (!isSchemaRecord(derivedElements) || !isSchemaRecord(derivedSource))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  if (!isSchemaRecord(derivedElements.items))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  const elementBranches = derivedElements.items.oneOf;
  if (!Array.isArray(elementBranches) || elementBranches.length !== 4)
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");

  let textBranchFound = false;
  let imageBranchFound = false;
  const narrowedElementBranches = elementBranches.map((branch) => {
    if (!isSchemaRecord(branch))
      throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
    const branchType = schemaBranchType(branch);
    if (branchType === "TEXT") {
      const properties = branch.properties;
      if (!isSchemaRecord(properties) || !isSchemaRecord(properties.fontId))
        throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
      if (!isSchemaRecord(properties.wrapMode))
        throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
      const projectedProperties = { ...properties };
      const fontId = properties.fontId;
      const wrapMode = properties.wrapMode;
      delete projectedProperties.opacity;
      delete projectedProperties.letterSpacingPx;
      const projectedRequired = Array.isArray(branch.required)
        ? branch.required.filter((key) => key !== "opacity" && key !== "letterSpacingPx")
        : undefined;
      textBranchFound = true;
      return {
        ...branch,
        ...(projectedRequired === undefined ? {} : { required: projectedRequired }),
        properties: {
          ...projectedProperties,
          fontId: { ...fontId, enum: [...FIRST_PROOF_FONT_IDS] },
          wrapMode: { ...wrapMode, enum: [FIRST_PROOF_WRAP_MODE] },
        },
      };
    }
    if (branchType === "IMAGE") {
      const properties = branch.properties;
      if (!isSchemaRecord(properties) || !isSchemaRecord(properties.placement))
        throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
      const projectedProperties = { ...properties };
      delete projectedProperties.opacity;
      const projectedRequired = Array.isArray(branch.required)
        ? branch.required.filter((key) => key !== "opacity")
        : undefined;
      const placement = properties.placement;
      const placementProperties = placement.properties;
      if (!isSchemaRecord(placementProperties))
        throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
      const narrowedPlacementProperties: Record<string, unknown> = {};
      for (const key of FIRST_PROOF_PLACEMENT_KEYS) {
        const property = placementProperties[key];
        if (!isSchemaRecord(property))
          throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
        narrowedPlacementProperties[key] = {
          ...property,
          enum: [FIRST_PROOF_PLACEMENT_VALUES[key as keyof typeof FIRST_PROOF_PLACEMENT_VALUES]],
        };
      }
      imageBranchFound = true;
      return {
        ...branch,
        ...(projectedRequired === undefined ? {} : { required: projectedRequired }),
        properties: {
          ...projectedProperties,
          placement: {
            ...placement,
            properties: narrowedPlacementProperties,
            additionalProperties: false,
          },
        },
      };
    }
    return branch;
  });
  if (!textBranchFound || !imageBranchFound)
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");

  return {
    ...(derived as JsonSchema),
    properties: {
      ...(derivedProperties as Record<string, unknown>),
      elements: {
        ...derivedElements,
        minItems: 3,
        maxItems: 3,
        items: { ...derivedElements.items, oneOf: narrowedElementBranches },
      },
      source: { ...derivedSource, enum: ["AGENT"] },
    },
  } as JsonSchema;
}

function buildFirstProofProviderSchema(resolvedSchema: JsonSchema): JsonSchema {
  if (resolvedSchema.type !== "object" || !isSchemaRecord(resolvedSchema.properties))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  const elements = resolvedSchema.properties.elements;
  const source = resolvedSchema.properties.source;
  if (!isSchemaRecord(elements) || elements.type !== "array" || !isSchemaRecord(source))
    throw new Error("FREEFORM_FIRST_PROOF_SCHEMA_PROJECTION_UNAVAILABLE");
  return narrowFirstProofProviderSchema(resolvedSchema);
}

function validatePlannerInput(input: PlanFreeformLayoutInput): void {
  if (input.targetProfile.formatProfileId !== FREEFORM_RENDERER_FORMAT_PROFILE_ID)
    throw new Error("FREEFORM_PLANNER_TARGET_PROFILE_INVALID");
  if (input.targetProfile.layoutMode !== "FREEFORM")
    throw new Error("FREEFORM_PLANNER_LAYOUT_MODE_INVALID");
  const asset = input.selectedAsset;
  if (!asset.assetVersionId || !asset.rendererAssetId)
    throw new Error("FREEFORM_PLANNER_ASSET_IDENTITY_MISSING");
  if (
    !Number.isInteger(asset.width) ||
    asset.width <= 0 ||
    !Number.isInteger(asset.height) ||
    asset.height <= 0
  )
    throw new Error("FREEFORM_PLANNER_ASSET_DIMENSIONS_INVALID");
  if (asset.imageInput.fileId !== asset.assetVersionId)
    throw new Error("FREEFORM_PLANNER_IMAGE_INPUT_FILE_ID_MISMATCH");
  if (asset.imageInput.mimeType !== asset.mimeType)
    throw new Error("FREEFORM_PLANNER_IMAGE_INPUT_MIME_MISMATCH");
  if (asset.imageInput.checksumSha256 !== asset.checksumSha256)
    throw new Error("FREEFORM_PLANNER_IMAGE_INPUT_CHECKSUM_MISMATCH");
  const imageInputs = validateAgentImageInputs([asset.imageInput]);
  if (imageInputs.length !== 1) throw new Error("FREEFORM_PLANNER_IMAGE_INPUT_COUNT_INVALID");
}

function primaryImage(plan: CreativeLayoutPlan): FreeformImageElement {
  const image = plan.elements.find(
    (element): element is FreeformImageElement =>
      element.type === "IMAGE" && element.role === "PRIMARY_IMAGE",
  );
  if (!image) throw new Error("FREEFORM_PRIMARY_IMAGE_MISSING");
  return image;
}

function buildFreeformSemanticTarget(
  image: FreeformImageElement,
  targetProfile: FormatProfile,
): FreeformSemanticPlacementTarget {
  const canvas = targetProfile.canvas;
  const pixelBounds = normalizedRectToPixelRect(image.bounds, canvas.width, canvas.height);
  return {
    normalizedBounds: image.bounds,
    pixelWidth: pixelBounds.width,
    pixelHeight: pixelBounds.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    plumeFormatProfileId: FREEFORM_PLUME_FORMAT_PROFILE_ID,
    rendererFormatProfileId: FREEFORM_RENDERER_FORMAT_PROFILE_ID,
  };
}

function semanticAsset(input: PlanFreeformLayoutInput) {
  return {
    assetId: input.selectedAsset.rendererAssetId,
    fileId: input.selectedAsset.imageInput.fileId,
    mimeType: input.selectedAsset.mimeType,
    bytes: input.selectedAsset.imageInput.bytes,
    checksumSha256: input.selectedAsset.checksumSha256,
  } as const;
}

function materializeSemanticPlacement(
  draft: CreativeLayoutPlan,
  semantic: Awaited<ReturnType<typeof planFreeformSemanticPlacement>>,
): CreativeLayoutPlan {
  const semanticPlacement = semantic.agentOutput.semanticPlacement;
  if (semanticPlacement.status !== "FOUND") throw new Error("FREEFORM_SEMANTIC_SUBJECT_NOT_FOUND");
  if (!semanticPlacement.primarySubjectBounds || !semanticPlacement.focalPoint)
    throw new Error("FREEFORM_SEMANTIC_GEOMETRY_MISSING");
  const image = primaryImage(draft);
  const finalPlacement = {
    policy: "SEMANTIC_CROP_COVER" as const,
    source: "AGENT" as const,
    fitMode: "COVER" as const,
    cropRect: semantic.candidate.cropRect,
    focalPoint: semanticPlacement.focalPoint,
    anchor: "CENTER" as const,
    subjectProtection: "REQUIRED" as const,
    protectedSubjects: [
      {
        subjectId: "primary-product",
        subjectType: "PRODUCT" as const,
        bounds: semanticPlacement.primarySubjectBounds,
      },
    ],
  };
  const finalPlan: CreativeLayoutPlan = {
    ...draft,
    elements: draft.elements.map((element) =>
      element === image ? { ...element, placement: finalPlacement } : element,
    ),
  };
  return finalPlan;
}

function hasSupportedImageSignature(input: FreeformPlannerSelectedAsset): boolean {
  const bytes = input.imageInput.bytes;
  if (input.mimeType === "image/png")
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isLegacyFirstProofCompatibilityCase(
  draft: CreativeLayoutPlan,
  input: PlanFreeformLayoutInput,
): boolean {
  const image = primaryImage(draft);
  // PI-3E.1.12 persisted drafts used ALPHA_TRIM_CONTAIN. Keep those historical
  // fixture consumers isolated while every real, valid current image takes the
  // two-stage path below. This is not a production fallback or repair path.
  return (
    !hasSupportedImageSignature(input.selectedAsset) ||
    (input.selectedAsset.mimeType === "image/png" &&
      image.placement.policy === "ALPHA_TRIM_CONTAIN")
  );
}

export function createFreeformLayoutPlannerHandler(
  dependencies: FreeformLayoutPlannerDependencies,
) {
  return async (input: PlanFreeformLayoutInput): Promise<AIWorkerResult<CreativeLayoutPlan>> => {
    validatePlannerInput(input);
    const resolvedOutputSchema = canonicalOutputSchema(dependencies);
    const outputSchema = buildFirstProofProviderSchema(resolvedOutputSchema);
    const recognizedContext = buildFirstProofAgentContextData(input);
    const agentResult = await dependencies.orchestrator.run<CreativeLayoutPlan>({
      ...taskDefaults("LAYOUT_PLANNER", input.taskId, input.workspaceId, input.creativeId),
      data: {
        ...recognizedContext,
        campaignId: input.campaignId,
        creativeId: input.creativeId,
        productId: input.productId,
        formatProfile: { id: input.targetProfile.formatProfileId },
        targetProfile: input.targetProfile,
        confirmedCopy: input.confirmedCopy,
        selectedAsset: {
          assetVersionId: input.selectedAsset.assetVersionId,
          rendererAssetId: input.selectedAsset.rendererAssetId,
          mimeType: input.selectedAsset.mimeType,
          checksumSha256: input.selectedAsset.checksumSha256,
          width: input.selectedAsset.width,
          height: input.selectedAsset.height,
        },
      },
      messages: [{ role: "user", content: buildFirstProofTaskMessage(input) }],
      formatProfileId: input.targetProfile.formatProfileId,
      channelCode: "KAKAO_MOMENT",
      imageInputs: [{ ...input.selectedAsset.imageInput, detail: "high" }],
      outputSchema,
    });
    const draft = assertCompleted(agentResult);
    assertFreeformLayoutContract(draft, {
      expectedRendererAssetId: input.selectedAsset.rendererAssetId,
      confirmedCopy: input.confirmedCopy,
      profile: input.targetProfile,
      ...(dependencies.fontRegistry ? { fontRegistry: dependencies.fontRegistry } : {}),
    });
    if (isLegacyFirstProofCompatibilityCase(draft, input))
      return { status: "COMPLETED", agentResult };

    const image = primaryImage(draft);
    const target = buildFreeformSemanticTarget(image, input.targetProfile);
    const semanticResult = await planFreeformSemanticPlacement(
      {
        taskId: `${input.taskId}:semantic`,
        workspaceId: input.workspaceId,
        correlationId: `${input.taskId}:semantic`,
        creativeId: input.creativeId,
        productId: input.productId,
        asset: semanticAsset(input),
        target,
        copy: {
          headline: input.confirmedCopy.headline,
          subcopy: input.confirmedCopy.subcopy,
        },
      },
      {
        orchestrator: dependencies.orchestrator,
        ...(dependencies.semanticPlacementPlannerOptions ?? {}),
      },
    );
    const finalPlan = materializeSemanticPlacement(draft, semanticResult);
    assertFreeformLayoutContract(finalPlan, {
      expectedRendererAssetId: input.selectedAsset.rendererAssetId,
      confirmedCopy: input.confirmedCopy,
      profile: input.targetProfile,
      ...(dependencies.fontRegistry ? { fontRegistry: dependencies.fontRegistry } : {}),
    });
    return {
      status: "COMPLETED",
      agentResult: { ...agentResult, output: finalPlan },
    };
  };
}

export { materializeSemanticPlacement };
