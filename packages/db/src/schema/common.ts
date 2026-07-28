import { integer, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

/** Columns shared by every persisted entity. */
export const identityColumns = {
  id: uuid("id").defaultRandom().primaryKey(),
};

/** UTC audit columns for mutable entities. */
export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  revisionNo: integer("revision_no").default(1).notNull(),
};

/** Soft-delete marker kept nullable so active-row indexes can be partial. */
export const softDeleteColumns = {
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
};

export const mutableColumns = {
  ...identityColumns,
  ...auditColumns,
  ...softDeleteColumns,
};

/** Append-only rows deliberately omit revision and soft-delete columns. */
export const appendOnlyColumns = {
  ...identityColumns,
  createdAt: auditColumns.createdAt,
};

/** Tenant foreign-key helper kept as a function for table-local references. */
export const workspaceIdColumn = (references?: () => AnyPgColumn) => {
  const column = uuid("workspace_id").notNull();
  return references ? column.references(references, { onDelete: "restrict" }) : column;
};
