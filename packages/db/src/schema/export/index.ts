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
import { appendOnlyColumns } from "../common.js";
import { exportItemStatusEnum, exportJobStatusEnum, fileRoleEnum } from "../enums.js";

export const exportJob = pgTable("export_job", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  asyncJobId: uuid("async_job_id"),
  exportRecipeId: uuid("export_recipe_id").notNull(),
  status: exportJobStatusEnum("status").notNull().default("QUEUED"),
  optionsJson: jsonb("options_json").$type<Record<string, unknown>>().notNull().default({}),
  manifestJson: jsonb("manifest_json").$type<Record<string, unknown>>(),
  requestedBy: uuid("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
});

export const exportItem = pgTable(
  "export_item",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    exportJobId: uuid("export_job_id").notNull(),
    creativeVersionId: uuid("creative_version_id").notNull(),
    approvalRequestId: uuid("approval_request_id").notNull(),
    validationRunId: uuid("validation_run_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: exportItemStatusEnum("status").notNull().default("PENDING"),
    errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
  },
  (table) => ({
    jobVersionUnique: uniqueIndex("export_item_job_creative_version_uq").on(
      table.exportJobId,
      table.creativeVersionId,
    ),
  }),
);

export const exportFile = pgTable(
  "export_file",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    exportJobId: uuid("export_job_id").notNull(),
    exportItemId: uuid("export_item_id"),
    fileObjectId: uuid("file_object_id").notNull(),
    fileRole: fileRoleEnum("file_role").notNull(),
    relativePath: text("relative_path").notNull(),
  },
  (table) => ({
    jobPathUnique: uniqueIndex("export_file_job_relative_path_uq").on(
      table.exportJobId,
      table.relativePath,
    ),
  }),
);
