import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appendOnlyColumns, auditColumns, identityColumns, softDeleteColumns } from "../common.js";
import {
  campaignAssetStatusEnum,
  campaignBriefStatusEnum,
  campaignBriefVersionStatusEnum,
  campaignChannelSelectionStatusEnum,
  campaignFormatSelectionStatusEnum,
  campaignProductStatusEnum,
  campaignSourceAnalysisStatusEnum,
  campaignSourceStatusEnum,
  campaignStatusEnum,
  generationRequestItemStatusEnum,
  generationRequestStatusEnum,
} from "../enums.js";

const createdUpdatedColumns = { ...identityColumns, ...auditColumns };

export const campaign = pgTable(
  "campaign",
  {
    ...identityColumns,
    ...auditColumns,
    ...softDeleteColumns,
    workspaceId: uuid("workspace_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    displayCode: varchar("display_code", { length: 50 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    objectiveCode: varchar("objective_code", { length: 100 }).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    landingUrl: text("landing_url"),
    ownerUserId: uuid("owner_user_id"),
    status: campaignStatusEnum("status").notNull().default("DRAFT"),
    currentStep: varchar("current_step", { length: 50 }).notNull(),
  },
  (table) => ({
    displayCodeUnique: uniqueIndex("campaign_workspace_display_code_uq").on(
      table.workspaceId,
      table.displayCode,
    ),
  }),
);

export const campaignSource = pgTable("campaign_source", {
  ...identityColumns,
  ...softDeleteColumns,
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  workspaceId: uuid("workspace_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  fileObjectId: uuid("file_object_id").notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  notes: text("notes"),
  status: campaignSourceStatusEnum("status").notNull().default("UPLOADED"),
  uploadedBy: uuid("uploaded_by"),
});

export const campaignSourceAnalysis = pgTable("campaign_source_analysis", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  campaignSourceId: uuid("campaign_source_id").notNull(),
  asyncJobId: uuid("async_job_id"),
  status: campaignSourceAnalysisStatusEnum("status").notNull().default("QUEUED"),
  extractedTextUri: text("extracted_text_uri"),
  analysisJson: jsonb("analysis_json").$type<Record<string, unknown>>().notNull().default({}),
  modelInfoJson: jsonb("model_info_json").$type<Record<string, unknown>>().notNull().default({}),
  errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
});

export const campaignBrief = pgTable(
  "campaign_brief",
  {
    ...identityColumns,
    ...auditColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    currentVersionId: uuid("current_version_id"),
    currentConfirmedVersionId: uuid("current_confirmed_version_id"),
    status: campaignBriefStatusEnum("status").notNull().default("DRAFT"),
  },
  (table) => ({
    campaignUnique: uniqueIndex("campaign_brief_campaign_uq").on(table.campaignId),
  }),
);

export const campaignBriefVersion = pgTable(
  "campaign_brief_version",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignBriefId: uuid("campaign_brief_id").notNull(),
    versionNo: integer("version_no").notNull(),
    parentVersionId: uuid("parent_version_id"),
    sourceKind: varchar("source_kind", { length: 30 }).notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    sourceCitationsJson: jsonb("source_citations_json").$type<unknown[]>().notNull().default([]),
    brandProfileSnapshotJson: jsonb("brand_profile_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: campaignBriefVersionStatusEnum("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    briefVersionUnique: uniqueIndex("campaign_brief_version_brief_version_uq").on(
      table.campaignBriefId,
      table.versionNo,
    ),
  }),
);

export const campaignProduct = pgTable(
  "campaign_product",
  {
    ...createdUpdatedColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    productId: uuid("product_id").notNull(),
    briefVersionId: uuid("brief_version_id").notNull(),
    sourceName: varchar("source_name", { length: 300 }),
    matchConfidence: numeric("match_confidence", { precision: 5, scale: 4 }),
    matchReason: text("match_reason"),
    status: campaignProductStatusEnum("status").notNull().default("PENDING"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    campaignProductUnique: uniqueIndex("campaign_product_campaign_product_uq").on(
      table.campaignId,
      table.productId,
    ),
  }),
);

export const campaignAsset = pgTable(
  "campaign_asset",
  {
    ...createdUpdatedColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    designAssetId: uuid("design_asset_id").notNull(),
    productId: uuid("product_id"),
    recommendationScore: numeric("recommendation_score", { precision: 7, scale: 4 }),
    recommendationJson: jsonb("recommendation_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: campaignAssetStatusEnum("status").notNull().default("RECOMMENDED"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    excludedReason: text("excluded_reason"),
  },
  (table) => ({
    campaignAssetUnique: uniqueIndex("campaign_asset_campaign_asset_product_uq").on(
      table.campaignId,
      table.designAssetId,
      table.productId,
    ),
  }),
);

export const campaignChannelSelection = pgTable(
  "campaign_channel_selection",
  {
    ...createdUpdatedColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    status: campaignChannelSelectionStatusEnum("status").notNull().default("SELECTED"),
    selectionReason: text("selection_reason"),
  },
  (table) => ({
    campaignChannelUnique: uniqueIndex("campaign_channel_selection_campaign_channel_uq").on(
      table.campaignId,
      table.channelId,
    ),
  }),
);

export const campaignFormatSelection = pgTable(
  "campaign_format_selection",
  {
    ...createdUpdatedColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    campaignChannelSelectionId: uuid("campaign_channel_selection_id").notNull(),
    formatProfileId: uuid("format_profile_id").notNull(),
    layoutTemplateId: uuid("layout_template_id"),
    placementIdsJson: jsonb("placement_ids_json").$type<string[]>().notNull().default([]),
    selectionJson: jsonb("selection_json").$type<Record<string, unknown>>().notNull().default({}),
    formatSnapshotJson: jsonb("format_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ruleSnapshotJson: jsonb("rule_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    exportRecipeSnapshotJson: jsonb("export_recipe_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: campaignFormatSelectionStatusEnum("status").notNull().default("SELECTED"),
  },
  (table) => ({
    campaignFormatUnique: uniqueIndex("campaign_format_selection_campaign_format_template_uq").on(
      table.campaignId,
      table.formatProfileId,
      table.layoutTemplateId,
    ),
  }),
);

export const generationRequest = pgTable("generation_request", {
  ...identityColumns,
  workspaceId: uuid("workspace_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  briefVersionId: uuid("brief_version_id").notNull(),
  creativeSetId: uuid("creative_set_id"),
  asyncJobId: uuid("async_job_id"),
  generationMode: varchar("generation_mode", { length: 50 }).notNull(),
  configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
  status: generationRequestStatusEnum("status").notNull().default("QUEUED"),
  requestedBy: uuid("requested_by"),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
});

export const generationRequestItem = pgTable(
  "generation_request_item",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    generationRequestId: uuid("generation_request_id").notNull(),
    productId: uuid("product_id"),
    campaignFormatSelectionId: uuid("campaign_format_selection_id").notNull(),
    assetSelectionJson: jsonb("asset_selection_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    copyConfigJson: jsonb("copy_config_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sortOrder: integer("sort_order").notNull(),
    status: generationRequestItemStatusEnum("status").notNull().default("QUEUED"),
    creativeId: uuid("creative_id"),
    errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    generationItemUnique: uniqueIndex("generation_request_item_request_product_format_uq").on(
      table.generationRequestId,
      table.productId,
      table.campaignFormatSelectionId,
    ),
  }),
);
