import {
  bigint,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { mutableColumns } from "../common.js";
import {
  advertiserStatusEnum,
  brandStatusEnum,
  productStatusEnum,
  productVariantStatusEnum,
} from "../enums.js";

export const advertiser = pgTable(
  "advertiser",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 200 }).notNull(),
    status: advertiserStatusEnum("status").notNull().default("ACTIVE"),
    ownerUserId: uuid("owner_user_id"),
  },
  (table) => ({
    activeNameUnique: uniqueIndex("advertiser_workspace_normalized_name_uq").on(
      table.workspaceId,
      table.normalizedName,
    ),
  }),
);

export const brand = pgTable(
  "brand",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    advertiserId: uuid("advertiser_id").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 200 }).notNull(),
    logoAssetId: uuid("logo_asset_id"),
    status: brandStatusEnum("status").notNull().default("ACTIVE"),
  },
  (table) => ({
    advertiserNameUnique: uniqueIndex("brand_advertiser_normalized_name_uq").on(
      table.advertiserId,
      table.normalizedName,
    ),
  }),
);

export const brandProfile = pgTable(
  "brand_profile",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    brandMessage: text("brand_message"),
    toneJson: jsonb("tone_json").$type<Record<string, unknown>>().notNull().default({}),
    colorTokensJson: jsonb("color_tokens_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    forbiddenExpressionsJson: jsonb("forbidden_expressions_json")
      .$type<unknown[]>()
      .notNull()
      .default([]),
  },
  (table) => ({
    brandUnique: uniqueIndex("brand_profile_brand_uq").on(table.brandId),
  }),
);

export const product = pgTable(
  "product",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 300 }).notNull(),
    internalCode: varchar("internal_code", { length: 100 }),
    categoryCode: varchar("category_code", { length: 100 }),
    landingUrl: text("landing_url"),
    description: text("description"),
    sellingPointsJson: jsonb("selling_points_json").$type<unknown[]>().notNull().default([]),
    attributesJson: jsonb("attributes_json").$type<Record<string, unknown>>().notNull().default({}),
    status: productStatusEnum("status").notNull().default("DRAFT"),
    representativeAssetId: uuid("representative_asset_id"),
  },
  (table) => ({
    brandInternalCodeUnique: uniqueIndex("product_brand_internal_code_uq").on(
      table.brandId,
      table.internalCode,
    ),
    brandStatusNameIndex: index("product_brand_status_normalized_name_idx").on(
      table.brandId,
      table.status,
      table.normalizedName,
    ),
  }),
);

export const productVariant = pgTable(
  "product_variant",
  {
    ...mutableColumns,
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    sku: varchar("sku", { length: 150 }),
    name: varchar("name", { length: 300 }).notNull(),
    attributesJson: jsonb("attributes_json").$type<Record<string, unknown>>().notNull().default({}),
    priceMinor: bigint("price_minor", { mode: "bigint" }),
    salePriceMinor: bigint("sale_price_minor", { mode: "bigint" }),
    currencyCode: varchar("currency_code", { length: 3 }),
    availability: varchar("availability", { length: 30 }),
    status: productVariantStatusEnum("status").notNull().default("ACTIVE"),
  },
  (table) => ({
    productSkuUnique: uniqueIndex("product_variant_product_sku_uq").on(table.productId, table.sku),
  }),
);
