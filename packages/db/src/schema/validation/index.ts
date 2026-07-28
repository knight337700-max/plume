import {
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
import { appendOnlyColumns, identityColumns, softDeleteColumns } from "../common.js";
import {
  commentStatusEnum,
  commentThreadStatusEnum,
  validationResultStatusEnum,
  validationRunStatusEnum,
  validationSeverityEnum,
  validationTypeEnum,
} from "../enums.js";

export const validationRun = pgTable(
  "validation_run",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    creativeVersionId: uuid("creative_version_id").notNull(),
    asyncJobId: uuid("async_job_id"),
    runNo: integer("run_no").notNull(),
    status: validationRunStatusEnum("status").notNull().default("QUEUED"),
    formatSnapshotJson: jsonb("format_snapshot_json").$type<Record<string, unknown>>().notNull(),
    ruleSnapshotJson: jsonb("rule_snapshot_json").$type<Record<string, unknown>>().notNull(),
    inputRenderId: uuid("input_render_id"),
    summaryJson: jsonb("summary_json").$type<Record<string, unknown>>().notNull().default({}),
    requestedBy: uuid("requested_by"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    creativeRunUnique: uniqueIndex("validation_run_creative_version_run_no_uq").on(
      table.creativeVersionId,
      table.runNo,
    ),
  }),
);

export const validationResult = pgTable("validation_result", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  validationRunId: uuid("validation_run_id").notNull(),
  ruleDefinitionId: uuid("rule_definition_id"),
  ruleCode: varchar("rule_code", { length: 250 }).notNull(),
  ruleVersion: varchar("rule_version", { length: 100 }).notNull(),
  resultType: validationTypeEnum("result_type").notNull(),
  severity: validationSeverityEnum("severity").notNull(),
  status: validationResultStatusEnum("status").notNull().default("OPEN"),
  targetElementIdsJson: jsonb("target_element_ids_json").$type<string[]>().notNull().default([]),
  message: text("message").notNull(),
  detailsJson: jsonb("details_json").$type<Record<string, unknown>>().notNull().default({}),
  suggestedFixJson: jsonb("suggested_fix_json").$type<Record<string, unknown>>(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
});

export const warningAcknowledgement = pgTable(
  "warning_acknowledgement",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    validationResultId: uuid("validation_result_id").notNull(),
    acknowledgedBy: uuid("acknowledged_by").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => ({
    resultUnique: uniqueIndex("warning_acknowledgement_result_uq").on(table.validationResultId),
  }),
);

export const commentThread = pgTable(
  "comment_thread",
  {
    ...identityColumns,
    ...softDeleteColumns,
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    workspaceId: uuid("workspace_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id").notNull(),
    status: commentThreadStatusEnum("status").notNull().default("OPEN"),
  },
  (table) => ({
    targetUnique: uniqueIndex("comment_thread_workspace_target_uq").on(
      table.workspaceId,
      table.targetType,
      table.targetId,
    ),
  }),
);

export const comment = pgTable("comment", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  commentThreadId: uuid("comment_thread_id").notNull(),
  authorId: uuid("author_id").notNull(),
  parentCommentId: uuid("parent_comment_id"),
  body: text("body").notNull(),
  status: commentStatusEnum("status").notNull().default("ACTIVE"),
  editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
});
