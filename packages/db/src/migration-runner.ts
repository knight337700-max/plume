import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres, { type Sql } from "postgres";

const MIGRATION_LOCK_KEY = "plume:staging:migrations";
const MIGRATION_TABLE = "plume_schema_migrations";

export interface MigrationDefinition {
  readonly id: string;
  readonly fileName: string;
  readonly sql: string;
  readonly checksum: string;
  readonly destructive: boolean;
}

export interface MigrationStatus {
  readonly id: string;
  readonly fileName: string;
  readonly checksum: string;
  readonly appliedAt: string | null;
  readonly applied: boolean;
}

export interface MigrationPlan {
  readonly applied: readonly MigrationStatus[];
  readonly pending: readonly MigrationDefinition[];
  readonly destructive: readonly MigrationDefinition[];
}

function migrationsDirectory(): string {
  return fileURLToPath(new URL("../migrations/", import.meta.url));
}

export function isDestructiveSql(sql: string): boolean {
  return /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/iu.test(sql);
}

export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export async function readMigrationDefinitions(
  directory = migrationsDirectory(),
): Promise<readonly MigrationDefinition[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const definitions: MigrationDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".sql") continue;
    const sql = await readFile(resolve(directory, entry.name), "utf8");
    const id = basename(entry.name, ".sql");
    definitions.push({
      id,
      fileName: entry.name,
      sql,
      checksum: migrationChecksum(sql),
      destructive: isDestructiveSql(sql),
    });
  }
  return Object.freeze(definitions.sort((left, right) => left.id.localeCompare(right.id)));
}

export function assertStagingTarget(input: {
  readonly appEnv?: string;
  readonly databaseUrl?: string;
}): string {
  if (input.appEnv !== "staging") throw new Error("APP_ENV=staging is required for staging migration");
  const url = input.databaseUrl?.trim();
  if (!url) throw new Error("DATABASE_URL is required for staging migration");
  return url;
}

export function assertBackupConfirmed(input: Readonly<Record<string, string | undefined>>): void {
  if (input.MIGRATION_BACKUP_CONFIRMED !== "true") {
    throw new Error("MIGRATION_BACKUP_CONFIRMED=true is required before applying staging migrations");
  }
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "migration operation failed";
  return error.message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/giu, "[REDACTED_DATABASE_URL]");
}

async function migrationTableExists(sql: Sql): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`SELECT to_regclass('public.plume_schema_migrations') IS NOT NULL AS exists`;
  return rows[0]?.exists === true;
}

async function appliedMigrations(
  sql: Sql,
): Promise<Map<string, { checksum: string | null; appliedAt: string }>> {
  if (!(await migrationTableExists(sql))) return new Map();
  const rows = await sql<{ id: string; applied_at: Date | string }[]>`
    SELECT id, applied_at
    FROM plume_schema_migrations
    ORDER BY id
  `;
  return new Map(rows.map((row) => [row.id, {
    checksum: null,
    appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at),
  }]));
}

export function createMigrationPlan(
  definitions: readonly MigrationDefinition[],
  applied: ReadonlyMap<string, { checksum: string | null; appliedAt: string }>,
): MigrationPlan {
  const statuses = definitions.map((definition) => {
    const record = applied.get(definition.id);
    return {
      id: definition.id,
      fileName: definition.fileName,
      checksum: definition.checksum,
      appliedAt: record?.appliedAt ?? null,
      applied: record !== undefined,
    };
  });
  const pending = definitions.filter((definition) => !applied.has(definition.id));
  return {
    applied: Object.freeze(statuses.filter((status) => status.applied)),
    pending: Object.freeze(pending),
    destructive: Object.freeze(pending.filter((definition) => definition.destructive)),
  };
}

async function withDatabase<T>(databaseUrl: string, operation: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    return await operation(sql);
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function withMigrationLock<T>(databaseUrl: string, operation: (sql: Sql) => Promise<T>): Promise<T> {
  return withDatabase(databaseUrl, async (sql) => {
    await sql`SELECT pg_advisory_lock(hashtext(${MIGRATION_LOCK_KEY}))`;
    try {
      return await operation(sql);
    } finally {
      await sql`SELECT pg_advisory_unlock(hashtext(${MIGRATION_LOCK_KEY}))`;
    }
  });
}

export async function inspectMigrations(databaseUrl: string): Promise<MigrationPlan> {
  const definitions = await readMigrationDefinitions();
  const applied = await withDatabase(databaseUrl, (sql) => appliedMigrations(sql));
  return createMigrationPlan(definitions, applied);
}

export async function applyStagingMigrations(
  input: Readonly<Record<string, string | undefined>> = process.env,
): Promise<MigrationPlan> {
  const databaseUrl = assertStagingTarget({ appEnv: input.APP_ENV, databaseUrl: input.DATABASE_URL });
  const definitions = await readMigrationDefinitions();
  return withMigrationLock(databaseUrl, async (sql) => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        id varchar(100) PRIMARY KEY,
        checksum varchar(64),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await sql.unsafe(`ALTER TABLE ${MIGRATION_TABLE} ADD COLUMN IF NOT EXISTS checksum varchar(64)`);
    const before = await appliedMigrations(sql);
    const pending = createMigrationPlan(definitions, before).pending;
    if (pending.some((migration) => migration.destructive)) {
      throw new Error(`destructive migration rejected: ${pending.filter((migration) => migration.destructive).map((migration) => migration.id).join(", ")}`);
    }
    if (pending.length > 0) assertBackupConfirmed(input);
    for (const migration of pending) {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration.sql);
        await transaction`
          INSERT INTO plume_schema_migrations (id, checksum)
          VALUES (${migration.id}, ${migration.checksum})
        `;
      });
    }
    return createMigrationPlan(definitions, await appliedMigrations(sql));
  });
}

function printPlan(plan: MigrationPlan): void {
  console.log(JSON.stringify({
    applied: plan.applied.map(({ id, fileName, appliedAt }) => ({ id, fileName, appliedAt })),
    pending: plan.pending.map(({ id, fileName, checksum, destructive }) => ({ id, fileName, checksum, destructive })),
    destructive: plan.destructive.map(({ id, fileName }) => ({ id, fileName })),
  }, null, 2));
}

export async function runMigrationCommand(command = process.argv[2] ?? "status"): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migration commands");
  if (command === "staging") {
    printPlan(await applyStagingMigrations(process.env));
    return;
  }
  if (command !== "check" && command !== "status") {
    throw new Error(`unknown migration command: ${command}`);
  }
  const plan = await inspectMigrations(databaseUrl);
  printPlan(plan);
  if (command === "check" && plan.destructive.length > 0) {
    throw new Error("destructive migration detected; no changes applied");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runMigrationCommand().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
