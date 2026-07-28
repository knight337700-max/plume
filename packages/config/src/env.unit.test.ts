import { describe, expect, it } from "vitest";

import { EnvironmentValidationError, formatEnvironmentIssues, loadEnvironment } from "./index.js";

const validEnvironment = {
  DATABASE_URL: "postgresql://plume:plume_local_only@localhost:5432/plume",
  TEST_DATABASE_URL: "postgresql://plume:plume_local_only@localhost:5432/plume_test",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY_ID: "plume",
  S3_SECRET_ACCESS_KEY: "plume_local_only",
};

describe("loadEnvironment", () => {
  it("parses the local service contract", () => {
    const environment = loadEnvironment(validEnvironment);

    expect(environment.nodeEnv).toBe("development");
    expect(environment.databaseUrl).toContain("/plume");
    expect(environment.testDatabaseUrl).toContain("/plume_test");
    expect(environment.s3Bucket).toBe("plume-local");
  });

  it("fails when a required value is missing", () => {
    expect(() => loadEnvironment({ ...validEnvironment, REDIS_URL: "" })).toThrow(
      EnvironmentValidationError,
    );
  });

  it("redacts secret values in formatted errors", () => {
    const message = formatEnvironmentIssues([
      { key: "S3_SECRET_ACCESS_KEY", message: "invalid value", received: "super-secret" },
    ]);

    expect(message).not.toContain("super-secret");
    expect(message).toContain("[REDACTED]");
  });
});
