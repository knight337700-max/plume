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
import { asyncJobItemStatusEnum, asyncJobStatusEnum, jobTypeEnum } from "../enums.js";

export const asyncJob = pgTable("async_job", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  jobType: jobTypeEnum("job_type").notNull(),
  status: asyncJobStatusEnum("status").notNull().default("QUEUED"),
  subjectType: varchar("subject_type", { length: 50 }),
  subjectId: uuid("subject_id"),
  requestedBy: uuid("requested_by"),
  correlationId: uuid("correlation_id"),
  idempotencyKey: varchar("idempotency_key", { length: 500 }),
  payloadHash: varchar("payload_hash", { length: 64 }),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
  progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  currentStep: varchar("current_step", { length: 100 }),
  attemptNo: integer("attempt_no").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
});

export const asyncJobItem = pgTable(
  "async_job_item",
  {
    ...appendOnlyColumns,
    workspaceId: uuid("workspace_id").notNull(),
    asyncJobId: uuid("async_job_id").notNull(),
    itemKey: varchar("item_key", { length: 250 }).notNull(),
    command: varchar("command", { length: 200 }),
    messageId: uuid("message_id"),
    causationId: uuid("causation_id"),
    subjectType: varchar("subject_type", { length: 50 }),
    subjectId: uuid("subject_id"),
    status: asyncJobItemStatusEnum("status").notNull().default("QUEUED"),
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    jobItemUnique: uniqueIndex("async_job_item_job_item_key_uq").on(
      table.asyncJobId,
      table.itemKey,
    ),
  }),
);

export const activityEvent = pgTable("activity_event", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  actorId: uuid("actor_id"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  summary: text("summary").notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
});

export const auditLog = pgTable("audit_log", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id"),
  actorId: uuid("actor_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id"),
  requestId: varchar("request_id", { length: 100 }),
  beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
  afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
  ipHash: varchar("ip_hash", { length: 255 }),
});

export const notification = pgTable("notification", {
  ...identityColumns,
  ...softDeleteColumns,
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  eventId: uuid("event_id"),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body").notNull(),
  deepLink: text("deep_link"),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
});
