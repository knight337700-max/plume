import {
  bigint,
  boolean,
  char,
  index,
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
import { designAssetStatusEnum } from "../enums.js";

export const fileObject = pgTable(
  "file_object",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    storageProvider: varchar("storage_provider", { length: 50 }).notNull(),
    bucket: varchar("bucket", { length: 200 }).notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 200 }).notNull(),
    bytes: bigint("bytes", { mode: "bigint" }).notNull(),
    checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    colorMode: varchar("color_mode", { length: 30 }),
    alpha: boolean("alpha"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    checksumIndex: index("file_object_checksum_sha256_idx").on(
      table.workspaceId,
      table.checksumSha256,
    ),
    contentUnique: uniqueIndex("file_object_workspace_checksum_bytes_uq").on(
      table.workspaceId,
      table.checksumSha256,
      table.bytes,
    ),
  }),
);

export const designAsset = pgTable(
  "design_asset",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    assetType: varchar("asset_type", { length: 50 }).notNull(),
    status: designAssetStatusEnum("status").notNull().default("PROCESSING"),
    currentVersionId: uuid("current_version_id"),
    licenseStatus: varchar("license_status", { length: 30 }).notNull(),
    licenseStartAt: timestamp("license_start_at", { withTimezone: true, mode: "date" }),
    licenseEndAt: timestamp("license_end_at", { withTimezone: true, mode: "date" }),
    analysisSummaryJson: jsonb("analysis_summary_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => ({
    brandAssetStatusIndex: index("design_asset_brand_type_status_idx").on(
      table.brandId,
      table.assetType,
      table.status,
    ),
  }),
);

export const assetVersion = pgTable(
  "asset_version",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    designAssetId: uuid("design_asset_id").notNull(),
    versionNo: integer("version_no").notNull(),
    fileObjectId: uuid("file_object_id").notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    analysisJson: jsonb("analysis_json").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    assetVersionUnique: uniqueIndex("asset_version_asset_version_uq").on(
      table.designAssetId,
      table.versionNo,
    ),
  }),
);

export const productAssetLink = pgTable(
  "product_asset_link",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    designAssetId: uuid("design_asset_id").notNull(),
    usageType: varchar("usage_type", { length: 50 }).notNull(),
    priority: integer("priority").notNull(),
    isRepresentative: boolean("is_representative").notNull().default(false),
    excludedFromGeneration: boolean("excluded_from_generation").notNull().default(false),
  },
  (table) => ({
    productAssetUsageUnique: uniqueIndex("product_asset_link_product_asset_usage_uq").on(
      table.productId,
      table.designAssetId,
      table.usageType,
    ),
  }),
);

export const assetTag = pgTable(
  "asset_tag",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 100 }).notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex("asset_tag_workspace_normalized_name_uq").on(
      table.workspaceId,
      table.normalizedName,
    ),
  }),
);

export const assetTagLink = pgTable(
  "asset_tag_link",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    designAssetId: uuid("design_asset_id").notNull(),
    assetTagId: uuid("asset_tag_id").notNull(),
  },
  (table) => ({
    assetTagUnique: uniqueIndex("asset_tag_link_asset_tag_uq").on(
      table.designAssetId,
      table.assetTagId,
    ),
  }),
);
