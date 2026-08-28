import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { appendOnlyColumns, auditColumns, identityColumns, softDeleteColumns } from "../common.js";
import { assetRoleCodeEnum, projectStatusEnum } from "../enums.js";

export const project = pgTable(
  "project",
  {
    ...identityColumns,
    ...auditColumns,
    ...softDeleteColumns,
    workspaceId: uuid("workspace_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    createdBy: uuid("created_by"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    status: projectStatusEnum("status").notNull().default("ACTIVE"),
  },
  (table) => ({
    campaignNameUnique: uniqueIndex("project_campaign_name_uq").on(table.campaignId, table.name),
  }),
);

export const projectAssetReference = pgTable(
  "project_asset_reference",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    assetVersionId: uuid("asset_version_id").notNull(),
    productId: uuid("product_id"),
    roleCode: assetRoleCodeEnum("role_code").notNull(),
    createdBy: uuid("created_by"),
  },
  (table) => ({
    referenceUnique: uniqueIndex("project_asset_reference_scope_uq").on(
      table.projectId,
      table.assetVersionId,
      table.productId,
    ),
  }),
);
