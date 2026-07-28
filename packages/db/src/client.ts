import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type DatabaseTarget = "workspace" | "test";

export interface DatabaseConnectionOptions {
  /** Selects the local workspace database or the isolated test database. */
  target?: DatabaseTarget;
  /** Explicit URL override, primarily useful for tests and CLI commands. */
  url?: string;
  max?: number;
}

export type PlumeDatabase = PostgresJsDatabase<Record<string, never>>;

function resolveDatabaseUrl(options: DatabaseConnectionOptions): string {
  if (options.url?.trim()) {
    return options.url.trim();
  }

  const key = options.target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required to create a database client`);
  }
  return value;
}

/**
 * Creates the low-level postgres client without issuing a query. The caller
 * owns the returned client and should call `end()` during process shutdown.
 */
export function createSqlClient(options: DatabaseConnectionOptions = {}): Sql {
  return postgres(resolveDatabaseUrl(options), {
    max: options.max ?? 10,
    onnotice: () => undefined,
  });
}

/** Creates a Drizzle database handle. Importing this module never connects. */
export function createDatabaseClient(options: DatabaseConnectionOptions = {}): {
  db: PlumeDatabase;
  sql: Sql;
} {
  const sql = createSqlClient(options);
  return { db: drizzle(sql), sql };
}

export const createDbClient = createDatabaseClient;
