import {
  boolean,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appendOnlyColumns, auditColumns, identityColumns, mutableColumns } from "../common.js";
import {
  userAccountStatusEnum,
  workspaceInvitationStatusEnum,
  workspaceMemberStatusEnum,
  workspaceRoleEnum,
  workspaceStatusEnum,
} from "../enums.js";

export const workspace = pgTable(
  "workspace",
  {
    ...mutableColumns,
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: workspaceStatusEnum("status").notNull().default("ACTIVE"),
  },
  (table) => ({
    slugUnique: uniqueIndex("workspace_slug_uq").on(table.slug),
  }),
);

export const userAccount = pgTable(
  "user_account",
  {
    ...mutableColumns,
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    status: userAccountStatusEnum("status").notNull().default("INVITED"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    emailUnique: uniqueIndex("user_account_email_uq").on(table.email),
  }),
);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    ...identityColumns,
    ...auditColumns,
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    roleCode: workspaceRoleEnum("role_code").notNull(),
    status: workspaceMemberStatusEnum("status").notNull().default("INVITED"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    workspaceUserUnique: uniqueIndex("workspace_member_workspace_user_uq").on(
      table.workspaceId,
      table.userId,
    ),
  }),
);

export const workspaceInvitation = pgTable("workspace_invitation", {
  ...appendOnlyColumns,
  workspaceId: uuid("workspace_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  roleCode: workspaceRoleEnum("role_code").notNull(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  status: workspaceInvitationStatusEnum("status").notNull().default("PENDING"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  invitedBy: uuid("invited_by").notNull(),
  acceptedBy: uuid("accepted_by"),
  respondedAt: timestamp("responded_at", { withTimezone: true, mode: "date" }),
});

export const workspacePolicy = pgTable(
  "workspace_policy",
  {
    ...identityColumns,
    ...auditColumns,
    workspaceId: uuid("workspace_id").notNull(),
    selfApprovalAllowed: boolean("self_approval_allowed").notNull().default(false),
    retentionDays: integer("retention_days"),
    filenamePattern: varchar("filename_pattern", { length: 500 }),
    policyJson: jsonb("policy_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    workspaceUnique: uniqueIndex("workspace_policy_workspace_uq").on(table.workspaceId),
  }),
);
