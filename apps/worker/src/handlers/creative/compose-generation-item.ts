import {
  composeCreativeDocument,
  type LayoutPlan,
} from "../../../../../packages/core/src/modules/creative/compose-document.js";
import type {
  CreativeRepositories,
  CreativeVersionRecord,
} from "../../../../../packages/core/src/modules/creative/repositories.js";
import type { CreativeDocument } from "../../../../../packages/core/src/modules/creative/creative-document.js";

export interface ComposeGenerationItemInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly creativeId: string;
  readonly productId: string | null;
  readonly briefVersionId: string;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly template?: Readonly<Record<string, unknown>>;
  readonly layoutPlan: LayoutPlan;
  readonly copyAssets?: Readonly<Record<string, string>>;
  readonly parentVersionId?: string | null;
  readonly createdBy?: string | null;
  readonly generationMetadata?: Readonly<Record<string, unknown>>;
  readonly safeZones?: readonly Readonly<Record<string, unknown>>[];
}

export interface ComposeGenerationItemResult {
  readonly status: "COMPLETED";
  readonly creativeVersion: CreativeVersionRecord;
  readonly document: CreativeDocument;
}

function usageType(type: string): string {
  return type === "LOGO" ? "LOGO" : type === "BACKGROUND" ? "BACKGROUND" : "IMAGE";
}

export function createGenerationItemComposer(dependencies: {
  readonly creatives: CreativeRepositories;
}) {
  return async (input: ComposeGenerationItemInput): Promise<ComposeGenerationItemResult> => {
    const document = composeCreativeDocument({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      creativeId: input.creativeId,
      productId: input.productId,
      briefVersionId: input.briefVersionId,
      plan: {
        ...input.layoutPlan,
        copyAssets: input.copyAssets ?? input.layoutPlan.copyAssets,
      },
      formatProfile: input.formatProfile,
      ...(input.template ? { template: input.template } : {}),
      ...(input.safeZones ? { safeZones: input.safeZones } : {}),
    });
    const creativeVersion = await dependencies.creatives.createVersion({
      workspaceId: input.workspaceId,
      creativeId: input.creativeId,
      parentVersionId: input.parentVersionId ?? null,
      formatProfileId: document.formatProfileId,
      layoutTemplateId: document.layoutTemplateId ?? null,
      briefVersionId: input.briefVersionId,
      documentJson: document,
      copyAssetsJson: document.copyAssets,
      generationMetadataJson: input.generationMetadata ?? { stage: "COMPOSED" },
      createdBy: input.createdBy ?? null,
    });
    const usages = document.elements.flatMap((element) =>
      element.assetVersionId
        ? [
            {
              workspaceId: input.workspaceId,
              creativeVersionId: creativeVersion.id,
              assetVersionId: element.assetVersionId,
              elementId: element.id,
              usageType: usageType(element.type),
              transformJson: {
                x: element.x,
                y: element.y,
                width: element.width,
                height: element.height,
                rotation: element.rotation ?? 0,
              },
            },
          ]
        : [],
    );
    if (usages.length) await dependencies.creatives.addAssetUsages(usages);
    return { status: "COMPLETED", creativeVersion, document };
  };
}
