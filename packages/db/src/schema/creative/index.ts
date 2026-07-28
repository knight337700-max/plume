import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appendOnlyColumns, mutableColumns } from "../common.js";
import {
  creativeRenderStatusEnum,
  creativeSetStatusEnum,
  creativeStatusEnum,
  creativeVersionStatusEnum,
} from "../enums.js";

export const creativeSet = pgTable("creative_set", {
  ...mutableColumns,
  workspaceId: uuid("workspace_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  generationRequestId: uuid("generation_request_id"),
  status: creativeSetStatusEnum("status").notNull().default("DRAFT"),
});

export const creative = pgTable("creative", {
  ...mutableColumns,
  workspaceId: uuid("workspace_id").notNull(),
  creativeSetId: uuid("creative_set_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  productId: uuid("product_id"),
  campaignFormatSelectionId: uuid("campaign_format_selection_id").notNull(),
  currentVersionId: uuid("current_version_id"),
  status: creativeStatusEnum("status").notNull().default("DRAFT"),
});

export const creativeVersion = pgTable(
  "creative_version",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    creativeId: uuid("creative_id").notNull(),
    versionNo: integer("version_no").notNull(),
    parentVersionId: uuid("parent_version_id"),
    formatProfileId: uuid("format_profile_id").notNull(),
    layoutTemplateId: uuid("layout_template_id"),
    briefVersionId: uuid("brief_version_id").notNull(),
    documentJson: jsonb("document_json").$type<Record<string, unknown>>().notNull(),
    copyAssetsJson: jsonb("copy_assets_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    generationMetadataJson: jsonb("generation_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: creativeVersionStatusEnum("status").notNull().default("DRAFT"),
    revisionNo: integer("revision_no").notNull().default(1),
    createdBy: uuid("created_by"),
    frozenAt: timestamp("frozen_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    creativeVersionUnique: uniqueIndex("creative_version_creative_version_no_uq").on(
      table.creativeId,
      table.versionNo,
    ),
  }),
);

export const creativeAssetUsage = pgTable(
  "creative_asset_usage",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    creativeVersionId: uuid("creative_version_id").notNull(),
    assetVersionId: uuid("asset_version_id").notNull(),
    elementId: varchar("element_id", { length: 150 }),
    usageType: varchar("usage_type", { length: 50 }).notNull(),
    transformJson: jsonb("transform_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    assetUsageUnique: uniqueIndex("creative_asset_usage_version_asset_element_uq").on(
      table.creativeVersionId,
      table.assetVersionId,
      table.elementId,
    ),
  }),
);

export const creativeEditOperation = pgTable(
  "creative_edit_operation",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    creativeVersionId: uuid("creative_version_id").notNull(),
    operationNo: integer("operation_no").notNull(),
    source: varchar("source", { length: 30 }).notNull(),
    commandText: text("command_text"),
    operationJson: jsonb("operation_json").$type<Record<string, unknown>>().notNull(),
    appliedBy: uuid("applied_by"),
  },
  (table) => ({
    operationUnique: uniqueIndex("creative_edit_operation_version_number_uq").on(
      table.creativeVersionId,
      table.operationNo,
    ),
  }),
);

export const creativeRender = pgTable("creative_render", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  creativeVersionId: uuid("creative_version_id").notNull(),
  asyncJobId: uuid("async_job_id"),
  renderPurpose: varchar("render_purpose", { length: 30 }).notNull(),
  fileObjectId: uuid("file_object_id").notNull(),
  status: creativeRenderStatusEnum("status").notNull().default("COMPLETED"),
  renderConfigJson: jsonb("render_config_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
});
