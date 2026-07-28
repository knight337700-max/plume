import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appendOnlyColumns } from "../common.js";
import { approvalRequestStatusEnum } from "../enums.js";

export const approvalRequest = pgTable("approval_request", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  creativeVersionId: uuid("creative_version_id").notNull(),
  validationRunId: uuid("validation_run_id").notNull(),
  stageNo: integer("stage_no").notNull(),
  requiredApprovals: integer("required_approvals").notNull(),
  status: approvalRequestStatusEnum("status").notNull().default("PENDING"),
  requestedBy: uuid("requested_by").notNull(),
  assigneeId: uuid("assignee_id"),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  supersededBy: uuid("superseded_by"),
});

export const approvalDecision = pgTable(
  "approval_decision",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    approvalRequestId: uuid("approval_request_id").notNull(),
    decision: text("decision").notNull(),
    decidedBy: uuid("decided_by").notNull(),
    comment: text("comment"),
    warningReason: text("warning_reason"),
    validationSnapshotJson: jsonb("validation_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    requestDeciderUnique: uniqueIndex("approval_decision_request_decider_uq").on(
      table.approvalRequestId,
      table.decidedBy,
    ),
  }),
);
