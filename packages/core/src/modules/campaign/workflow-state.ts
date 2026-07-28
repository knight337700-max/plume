import type { CampaignRecord, CampaignSourceRecord, CampaignProductRecord, CampaignAssetPoolSelectionRecord, CampaignBriefVersionRecord, CampaignChannelSelectionRecord, CampaignFormatSelectionRecord } from "./repositories.js";

export type CampaignWorkflowStep = "SOURCES" | "BRIEF" | "PRODUCT_MATCHING" | "ASSET_POOL" | "MEDIA_SELECTION" | "READY";
export interface WorkflowStateInput { readonly campaign: CampaignRecord; readonly sources: readonly CampaignSourceRecord[]; readonly briefVersion?: CampaignBriefVersionRecord; readonly products: readonly CampaignProductRecord[]; readonly assetSelections: readonly CampaignAssetPoolSelectionRecord[]; readonly channels: readonly CampaignChannelSelectionRecord[]; readonly formats: readonly CampaignFormatSelectionRecord[]; readonly matchingBriefVersionId?: string; readonly recommendationBriefVersionId?: string; readonly generationBriefVersionId?: string }
export interface WorkflowState { readonly currentStep: CampaignWorkflowStep; readonly blockers: readonly { readonly code: string; readonly message: string }[]; readonly stale: { readonly matching: boolean; readonly recommendations: boolean; readonly generation: boolean }; readonly persistedStep: string }

export function deriveWorkflowState(input: WorkflowStateInput): WorkflowState {
  const blockers: { code: string; message: string }[] = [];
  const activeSources = input.sources.filter((source) => source.status === "ACTIVE");
  if (activeSources.length === 0) blockers.push({ code: "SOURCES_REQUIRED", message: "At least one active campaign source is required" });
  if (!input.briefVersion || input.briefVersion.status !== "CONFIRMED") blockers.push({ code: "BRIEF_REQUIRED", message: "A confirmed brief version is required" });
  const stale = { matching: Boolean(input.briefVersion && input.matchingBriefVersionId && input.matchingBriefVersionId !== input.briefVersion.id), recommendations: Boolean(input.briefVersion && input.recommendationBriefVersionId && input.recommendationBriefVersionId !== input.briefVersion.id), generation: Boolean(input.briefVersion && input.generationBriefVersionId && input.generationBriefVersionId !== input.briefVersion.id) };
  if (input.briefVersion && stale.matching) blockers.push({ code: "MATCHING_STALE", message: "Product matching must be rerun for the current brief" });
  if (input.products.filter((product) => product.status === "CONFIRMED").length === 0) blockers.push({ code: "PRODUCTS_REQUIRED", message: "At least one product must be confirmed" });
  if (input.products.some((product) => product.status === "CONFIRMED") && input.assetSelections.filter((selection) => selection.status === "SELECTED").length === 0) blockers.push({ code: "ASSET_POOL_REQUIRED", message: "At least one asset must be selected" });
  if (input.channels.filter((selection) => selection.status === "SELECTED").length === 0) blockers.push({ code: "CHANNELS_REQUIRED", message: "At least one channel must be selected" });
  if (input.channels.some((selection) => selection.status === "SELECTED") && input.formats.filter((selection) => selection.status === "SELECTED").length === 0) blockers.push({ code: "FORMATS_REQUIRED", message: "At least one format must be selected" });
  const currentStep: CampaignWorkflowStep = blockers.some((blocker) => blocker.code === "SOURCES_REQUIRED") ? "SOURCES" : blockers.some((blocker) => ["BRIEF_REQUIRED", "MATCHING_STALE"].includes(blocker.code)) ? "BRIEF" : blockers.some((blocker) => blocker.code === "PRODUCTS_REQUIRED") ? "PRODUCT_MATCHING" : blockers.some((blocker) => blocker.code === "ASSET_POOL_REQUIRED") ? "ASSET_POOL" : blockers.some((blocker) => ["CHANNELS_REQUIRED", "FORMATS_REQUIRED"].includes(blocker.code)) ? "MEDIA_SELECTION" : "READY";
  return { currentStep, blockers, stale, persistedStep: input.campaign.currentStep };
}
