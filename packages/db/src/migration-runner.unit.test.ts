import { describe, expect, it } from "vitest";
import {
  assertBackupConfirmed,
  assertStagingTarget,
  createMigrationPlan,
  isDestructiveSql,
  migrationChecksum,
  readMigrationDefinitions,
} from "./migration-runner.js";

describe("staging migration runner contract", () => {
  it("detects the repository migrations without hardcoded test targets", async () => {
    const migrations = await readMigrationDefinitions();
    expect(migrations.map((migration) => migration.id)).toEqual([
      "0001_initial",
      "0002_durable_async_command_metadata",
      "0003_live_smoke_budget_ledger",
      "0004_live_smoke_budget_epochs",
      "0005_live_coverage_shadow_runs",
      "0006_live_smoke_lifecycle_and_canary",
      "0007_live_smoke_validation_evidence",
      "0008_production_runtime_boundaries",
    ]);
    expect(migrations[0]?.destructive).toBe(false);
    expect(migrations[0]?.checksum).toBe(migrationChecksum(migrations[0]?.sql ?? ""));
  });

  it("reports pending and applied migrations without mutating", () => {
    const definitions = [
      {
        id: "0001_initial",
        fileName: "0001_initial.sql",
        sql: "CREATE TABLE example (id uuid PRIMARY KEY);",
        checksum: "checksum-1",
        destructive: false,
      },
    ];
    const pending = createMigrationPlan(definitions, new Map());
    expect(pending.pending).toHaveLength(1);
    const applied = createMigrationPlan(
      definitions,
      new Map([["0001_initial", { checksum: "checksum-1", appliedAt: "now" }]]),
    );
    expect(applied.applied).toHaveLength(1);
    expect(applied.pending).toHaveLength(0);
  });

  it("rejects destructive SQL and unconfirmed staging apply", () => {
    expect(isDestructiveSql("DROP TABLE example")).toBe(true);
    expect(isDestructiveSql("CREATE TABLE example (id uuid PRIMARY KEY)")).toBe(false);
    expect(() =>
      assertStagingTarget({ appEnv: "production", databaseUrl: "postgresql://db/plume" }),
    ).toThrow(/APP_ENV/);
    expect(() => assertBackupConfirmed({})).toThrow(/MIGRATION_BACKUP_CONFIRMED/);
    expect(() => assertBackupConfirmed({ MIGRATION_BACKUP_CONFIRMED: "true" })).not.toThrow();
  });
});
