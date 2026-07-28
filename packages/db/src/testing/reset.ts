import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const defaultAdminUrl = "postgresql://plume:plume_local_only@localhost:5432/plume";
const defaultTestUrl = "postgresql://plume:plume_local_only@localhost:5432/plume_test";

export interface TestDatabaseTarget {
  url: string;
  database: string;
  host: string;
}

function parseTarget(url: string): TestDatabaseTarget {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  return { url, database, host: parsed.hostname };
}

function assertLocal(target: TestDatabaseTarget): void {
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(target.host)) {
    throw new Error("Test database must use a local host");
  }
}

/** Validates that a URL is a non-production, isolated local test database. */
export function assertTestDatabase(
  url = process.env.TEST_DATABASE_URL?.trim() || defaultTestUrl,
  adminUrl = process.env.DATABASE_URL?.trim() || defaultAdminUrl,
): TestDatabaseTarget {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("Database reset is disabled in production");
  }

  const target = parseTarget(url);
  const admin = parseTarget(adminUrl);
  assertLocal(target);
  assertLocal(admin);
  if (!(target.database === "plume_test" || target.database.endsWith("_test"))) {
    throw new Error("Test database name must be plume_test or end with _test");
  }
  if (target.url === admin.url || target.database === admin.database) {
    throw new Error("Test database must be separate from the workspace database");
  }
  return target;
}

async function ensureDatabase(target: TestDatabaseTarget, adminUrl: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1 });
  try {
    const rows = await admin<
      { exists: boolean }[]
    >`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${target.database}) AS exists`;
    if (!rows[0]?.exists) {
      const identifier = target.database.replace(/"/g, '""');
      await admin.unsafe(`CREATE DATABASE "${identifier}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function migrationSql(): Promise<string> {
  return readFile(new URL("../../migrations/0001_initial.sql", import.meta.url), "utf8");
}

/** Provisions the local test database and applies the initial migration once. */
export async function migrateTestDatabase(
  url = process.env.TEST_DATABASE_URL?.trim() || defaultTestUrl,
  adminUrl = process.env.DATABASE_URL?.trim() || defaultAdminUrl,
): Promise<void> {
  const target = assertTestDatabase(url, adminUrl);
  await ensureDatabase(target, adminUrl);
  const db = postgres(target.url, { max: 1 });
  try {
    await db`CREATE TABLE IF NOT EXISTS plume_schema_migrations (id varchar(100) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const applied = await db`SELECT id FROM plume_schema_migrations WHERE id = '0001_initial'`;
    if (applied.length > 0) return;

    const sql = await migrationSql();
    await db.begin(async (transaction) => {
      await transaction.unsafe(sql);
      await transaction`INSERT INTO plume_schema_migrations (id) VALUES ('0001_initial')`;
    });
  } finally {
    await db.end({ timeout: 5 });
  }
}

/** Rebuilds only a validated local test database, then reapplies migrations. */
export async function resetTestDatabase(
  url = process.env.TEST_DATABASE_URL?.trim() || defaultTestUrl,
  adminUrl = process.env.DATABASE_URL?.trim() || defaultAdminUrl,
): Promise<void> {
  const target = assertTestDatabase(url, adminUrl);
  await ensureDatabase(target, adminUrl);
  const db = postgres(target.url, { max: 1 });
  try {
    await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await db.end({ timeout: 5 });
  }
  await migrateTestDatabase(url, adminUrl);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] ?? "migrate";
  if (command === "reset") {
    await resetTestDatabase();
  } else {
    await migrateTestDatabase();
  }
}
