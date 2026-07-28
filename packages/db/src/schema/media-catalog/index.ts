import {
  boolean,
  char,
  date,
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
  adProductStatusEnum,
  catalogOverrideStatusEnum,
  channelStatusEnum,
  exportRecipeStatusEnum,
  formatPlacementStatusEnum,
  formatProfileStatusEnum,
  guidelineVersionStatusEnum,
  layoutTemplateStatusEnum,
  placementStatusEnum,
  productFamilyStatusEnum,
  ruleSetStatusEnum,
} from "../enums.js";

export const channel = pgTable(
  "channel",
  {
    ...appendOnlyColumns,
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    status: channelStatusEnum("status").notNull().default("ACTIVE"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("channel_code_uq").on(table.code),
  }),
);

export const productFamily = pgTable(
  "product_family",
  {
    ...appendOnlyColumns,
    channelId: uuid("channel_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    purchaseType: varchar("purchase_type", { length: 30 }),
    status: productFamilyStatusEnum("status").notNull().default("ACTIVE"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    channelCodeUnique: uniqueIndex("product_family_channel_code_uq").on(
      table.channelId,
      table.code,
    ),
  }),
);

export const adProduct = pgTable(
  "ad_product",
  {
    ...appendOnlyColumns,
    productFamilyId: uuid("product_family_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: adProductStatusEnum("status").notNull().default("ACTIVE"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    familyCodeUnique: uniqueIndex("ad_product_family_code_uq").on(
      table.productFamilyId,
      table.code,
    ),
  }),
);

export const placement = pgTable(
  "placement",
  {
    ...appendOnlyColumns,
    channelId: uuid("channel_id").notNull(),
    code: varchar("code", { length: 150 }).notNull(),
    name: varchar("name", { length: 250 }).notNull(),
    surface: varchar("surface", { length: 100 }),
    status: placementStatusEnum("status").notNull().default("ACTIVE"),
    availabilityJson: jsonb("availability_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => ({
    channelCodeUnique: uniqueIndex("placement_channel_code_uq").on(table.channelId, table.code),
  }),
);

export const guidelineVersion = pgTable(
  "guideline_version",
  {
    ...appendOnlyColumns,
    channelId: uuid("channel_id").notNull(),
    version: varchar("version", { length: 100 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    verificationStatus: varchar("verification_status", { length: 40 }).notNull(),
    status: guidelineVersionStatusEnum("status").notNull().default("DRAFT"),
  },
  (table) => ({
    channelVersionUnique: uniqueIndex("guideline_version_channel_version_uq").on(
      table.channelId,
      table.version,
    ),
  }),
);

export const sourceReference = pgTable("source_reference", {
  ...appendOnlyColumns,
  guidelineVersionId: uuid("guideline_version_id").notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  url: text("url"),
  fileHash: char("file_hash", { length: 64 }),
  accessedAt: timestamp("accessed_at", { withTimezone: true, mode: "date" }),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
});

export const exportRecipe = pgTable(
  "export_recipe",
  {
    ...appendOnlyColumns,
    stableKey: varchar("stable_key", { length: 200 }).notNull(),
    version: varchar("version", { length: 50 }).notNull(),
    name: varchar("name", { length: 250 }).notNull(),
    recipeJson: jsonb("recipe_json").$type<Record<string, unknown>>().notNull(),
    status: exportRecipeStatusEnum("status").notNull().default("DRAFT"),
  },
  (table) => ({
    stableVersionUnique: uniqueIndex("export_recipe_stable_key_version_uq").on(
      table.stableKey,
      table.version,
    ),
  }),
);

export const formatProfile = pgTable(
  "format_profile",
  {
    ...appendOnlyColumns,
    channelId: uuid("channel_id").notNull(),
    adProductId: uuid("ad_product_id").notNull(),
    guidelineVersionId: uuid("guideline_version_id"),
    exportRecipeId: uuid("export_recipe_id").notNull(),
    stableKey: varchar("stable_key", { length: 250 }).notNull(),
    version: varchar("version", { length: 100 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    renderMode: varchar("render_mode", { length: 60 }).notNull(),
    mediaType: varchar("media_type", { length: 50 }).notNull(),
    status: formatProfileStatusEnum("status").notNull().default("DRAFT"),
    verificationStatus: varchar("verification_status", { length: 50 }).notNull(),
    specJson: jsonb("spec_json").$type<Record<string, unknown>>().notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
  },
  (table) => ({
    stableVersionUnique: uniqueIndex("format_profile_stable_key_version_uq").on(
      table.stableKey,
      table.version,
    ),
  }),
);

export const formatPlacement = pgTable(
  "format_placement",
  {
    ...appendOnlyColumns,
    formatProfileId: uuid("format_profile_id").notNull(),
    placementId: uuid("placement_id").notNull(),
    status: formatPlacementStatusEnum("status").notNull().default("ACTIVE"),
    overrideJson: jsonb("override_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    profilePlacementUnique: uniqueIndex("format_placement_profile_placement_uq").on(
      table.formatProfileId,
      table.placementId,
    ),
  }),
);

export const ruleSet = pgTable(
  "rule_set",
  {
    ...appendOnlyColumns,
    guidelineVersionId: uuid("guideline_version_id"),
    stableKey: varchar("stable_key", { length: 250 }).notNull(),
    version: varchar("version", { length: 100 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    scope: varchar("scope", { length: 50 }).notNull(),
    status: ruleSetStatusEnum("status").notNull().default("DRAFT"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    stableVersionUnique: uniqueIndex("rule_set_stable_key_version_uq").on(
      table.stableKey,
      table.version,
    ),
  }),
);

export const ruleDefinition = pgTable(
  "rule_definition",
  {
    ...appendOnlyColumns,
    ruleSetId: uuid("rule_set_id").notNull(),
    ruleCode: varchar("rule_code", { length: 250 }).notNull(),
    ruleType: varchar("rule_type", { length: 40 }).notNull(),
    scope: varchar("scope", { length: 50 }).notNull(),
    target: varchar("target", { length: 50 }).notNull(),
    operator: varchar("operator", { length: 100 }).notNull(),
    valueJson: jsonb("value_json").$type<Record<string, unknown>>().notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    autoFix: varchar("auto_fix", { length: 50 }).notNull(),
    message: text("message").notNull(),
    sourceReferenceId: uuid("source_reference_id"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    ruleCodeUnique: uniqueIndex("rule_definition_rule_set_code_uq").on(
      table.ruleSetId,
      table.ruleCode,
    ),
  }),
);

export const formatRuleSet = pgTable(
  "format_rule_set",
  {
    ...appendOnlyColumns,
    formatProfileId: uuid("format_profile_id").notNull(),
    ruleSetId: uuid("rule_set_id").notNull(),
    priority: integer("priority").notNull(),
    required: boolean("required").notNull().default(true),
  },
  (table) => ({
    profileRuleSetUnique: uniqueIndex("format_rule_set_profile_rule_set_uq").on(
      table.formatProfileId,
      table.ruleSetId,
    ),
  }),
);

export const layoutTemplate = pgTable(
  "layout_template",
  {
    ...appendOnlyColumns,
    guidelineVersionId: uuid("guideline_version_id"),
    stableKey: varchar("stable_key", { length: 250 }).notNull(),
    version: varchar("version", { length: 100 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    templateType: varchar("template_type", { length: 50 }).notNull(),
    templateJson: jsonb("template_json").$type<Record<string, unknown>>().notNull(),
    previewFileHash: varchar("preview_file_hash", { length: 64 }),
    status: layoutTemplateStatusEnum("status").notNull().default("DRAFT"),
  },
  (table) => ({
    stableVersionUnique: uniqueIndex("layout_template_stable_key_version_uq").on(
      table.stableKey,
      table.version,
    ),
  }),
);

export const formatTemplate = pgTable(
  "format_template",
  {
    ...appendOnlyColumns,
    formatProfileId: uuid("format_profile_id").notNull(),
    layoutTemplateId: uuid("layout_template_id").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => ({
    profileTemplateUnique: uniqueIndex("format_template_profile_template_uq").on(
      table.formatProfileId,
      table.layoutTemplateId,
    ),
  }),
);

export const catalogOverride = pgTable(
  "catalog_override",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id").notNull(),
    overrideJson: jsonb("override_json").$type<Record<string, unknown>>().notNull(),
    status: catalogOverrideStatusEnum("status").notNull().default("ACTIVE"),
  },
  (table) => ({
    targetUnique: uniqueIndex("catalog_override_workspace_target_uq").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
  }),
);
