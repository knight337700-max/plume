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

  it("accepts a staging contract without an OpenAI key in mock mode", () => {
    const environment = loadEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
      APP_ENV: "staging",
      QUEUE_PREFIX: "plume-staging",
      CORS_ALLOWED_ORIGINS: "https://staging.example.test",
      COOKIE_SECURE: "true",
      OPENAI_PROVIDER_MODE: "mock",
    });

    expect(environment.appEnv).toBe("staging");
    expect(environment.openAiProviderMode).toBe("mock");
    expect(environment.queuePrefix).toBe("plume-staging");
    expect(environment.cookieSecure).toBe(true);
  });

  it("rejects invalid staging and live contracts", () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        APP_ENV: "staging",
        QUEUE_PREFIX: "production",
        CORS_ALLOWED_ORIGINS: "*",
        COOKIE_SECURE: "false",
        OPENAI_PROVIDER_MODE: "live",
      }),
    ).toThrow(/OPENAI_API_KEY|OPENAI_MODEL|QUEUE_PREFIX|CORS_ALLOWED_ORIGINS|COOKIE_SECURE/);
  });

  it("uses GPT-5.6 Luna as the only model default", () => {
    const environment = loadEnvironment(validEnvironment);
    expect(environment.openAiModel).toBe("gpt-5.6-luna");
    expect(loadEnvironment({ ...validEnvironment, OPENAI_MODEL: "gpt-5.6-luna" }).openAiModel).toBe(
      "gpt-5.6-luna",
    );
    expect(() => loadEnvironment({ ...validEnvironment, OPENAI_MODEL: "gpt-5-mini" })).toThrow(
      /Unsupported OPENAI_MODEL/,
    );
  });

  it("rejects staging mode when NODE_ENV is staging", () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: "staging",
        APP_ENV: "staging",
        QUEUE_PREFIX: "plume-staging",
        CORS_ALLOWED_ORIGINS: "https://staging.example.test",
        COOKIE_SECURE: "true",
      }),
    ).toThrow(/NODE_ENV/);
  });

  it("requires an explicit Production resource, security, and runtime contract", () => {
    expect(() => loadEnvironment({ NODE_ENV: "production", APP_ENV: "production" })).toThrow(
      /QUEUE_PREFIX|S3_BUCKET|SESSION_SECRET|PUBLIC_WEB_URL|REQUEST_BODY_LIMIT_BYTES/,
    );
  });

  it("accepts a complete Production Mock contract without reading secret values", () => {
    const environment = loadEnvironment({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgresql://prod-db/plume",
      REDIS_URL: "rediss://prod-redis:6379",
      QUEUE_PREFIX: "plume-production",
      S3_ENDPOINT: "https://storage.prod.test",
      S3_BUCKET: "plume-production-assets",
      S3_ACCESS_KEY_ID: "production-access-id",
      S3_SECRET_ACCESS_KEY: "production-secret-value",
      SESSION_SECRET: "production-session-secret-with-enough-entropy",
      CORS_ALLOWED_ORIGINS: "https://web.prod.test",
      COOKIE_SECURE: "true",
      COOKIE_SAME_SITE: "strict",
      OPENAI_PROVIDER_MODE: "mock",
      OPENAI_MODEL: "gpt-5.6-luna",
      PUBLIC_WEB_URL: "https://web.prod.test",
      PUBLIC_API_URL: "https://api.prod.test",
      REQUEST_BODY_LIMIT_BYTES: "1048576",
      RATE_LIMIT_WINDOW_MS: "60000",
      RATE_LIMIT_MAX_REQUESTS: "60",
      UPLOAD_MAX_BYTES: "104857600",
      UPLOAD_MAX_PIXELS: "100000000",
      UPLOAD_ALLOWED_MIME_TYPES: "image/png,image/jpeg",
      UPLOAD_SIGNED_URL_TTL_SECONDS: "900",
    });

    expect(environment.appEnv).toBe("production");
    expect(environment.queuePrefix).toBe("plume-production");
    expect(environment.s3Bucket).toBe("plume-production-assets");
    expect(environment.openAiModel).toBe("gpt-5.6-luna");
    expect(environment.openAiProviderMode).toBe("mock");
  });

  it("rejects Production Staging/local resources and wildcard CORS", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgresql://localhost/plume",
        REDIS_URL: "redis://127.0.0.1:6379",
        QUEUE_PREFIX: "plume-staging",
        S3_ENDPOINT: "http://localhost:9000",
        S3_BUCKET: "plume-staging-assets",
        S3_ACCESS_KEY_ID: "local",
        S3_SECRET_ACCESS_KEY: "local",
        SESSION_SECRET: "plume-development-session-secret-change-me-32-chars",
        CORS_ALLOWED_ORIGINS: "*",
        COOKIE_SECURE: "false",
        COOKIE_SAME_SITE: "lax",
        OPENAI_PROVIDER_MODE: "mock",
        OPENAI_MODEL: "gpt-5.6-luna",
        PUBLIC_WEB_URL: "http://localhost:5173",
        PUBLIC_API_URL: "http://localhost:3000",
        REQUEST_BODY_LIMIT_BYTES: "1",
        RATE_LIMIT_WINDOW_MS: "1",
        RATE_LIMIT_MAX_REQUESTS: "1",
        UPLOAD_MAX_BYTES: "1",
        UPLOAD_MAX_PIXELS: "1",
        UPLOAD_ALLOWED_MIME_TYPES: "image/png",
        UPLOAD_SIGNED_URL_TTL_SECONDS: "1",
      }),
    ).toThrow(/localhost|QUEUE_PREFIX|S3_BUCKET|SESSION_SECRET|CORS_ALLOWED_ORIGINS/);
  });

  it("requires explicit Production approval and budgets before Live mode", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgresql://prod-db/plume",
        REDIS_URL: "rediss://prod-redis:6379",
        QUEUE_PREFIX: "plume-production",
        S3_ENDPOINT: "https://storage.prod.test",
        S3_BUCKET: "plume-production-assets",
        S3_ACCESS_KEY_ID: "production-access-id",
        S3_SECRET_ACCESS_KEY: "production-secret-value",
        SESSION_SECRET: "production-session-secret-with-enough-entropy",
        CORS_ALLOWED_ORIGINS: "https://web.prod.test",
        COOKIE_SECURE: "true",
        COOKIE_SAME_SITE: "strict",
        OPENAI_PROVIDER_MODE: "live",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "not-used-in-test",
        PUBLIC_WEB_URL: "https://web.prod.test",
        PUBLIC_API_URL: "https://api.prod.test",
        REQUEST_BODY_LIMIT_BYTES: "1048576",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "60",
        UPLOAD_MAX_BYTES: "104857600",
        UPLOAD_MAX_PIXELS: "100000000",
        UPLOAD_ALLOWED_MIME_TYPES: "image/png",
        UPLOAD_SIGNED_URL_TTL_SECONDS: "900",
      }),
    ).toThrow(/OPENAI_LIVE_APPROVED|OPENAI_MONTHLY_BUDGET_USD/);
  });

  it("requires explicit fixed-precision pricing for Production Live mode", () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgresql://prod-db/plume",
        REDIS_URL: "rediss://prod-redis:6379",
        QUEUE_PREFIX: "plume-production",
        S3_ENDPOINT: "https://storage.prod.test",
        S3_BUCKET: "plume-production-assets",
        S3_ACCESS_KEY_ID: "production-access-id",
        S3_SECRET_ACCESS_KEY: "production-secret-value",
        SESSION_SECRET: "production-session-secret-with-enough-entropy",
        CORS_ALLOWED_ORIGINS: "https://web.prod.test",
        COOKIE_SECURE: "true",
        COOKIE_SAME_SITE: "strict",
        OPENAI_PROVIDER_MODE: "live",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_API_KEY: "not-used-in-test",
        OPENAI_LIVE_APPROVED: "true",
        OPENAI_MONTHLY_BUDGET_USD: "10",
        OPENAI_SOFT_STOP_USD: "8",
        OPENAI_HARD_STOP_USD: "10",
        OPENAI_MAX_CONCURRENCY: "1",
        PUBLIC_WEB_URL: "https://web.prod.test",
        PUBLIC_API_URL: "https://api.prod.test",
        REQUEST_BODY_LIMIT_BYTES: "1048576",
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "60",
        UPLOAD_MAX_BYTES: "104857600",
        UPLOAD_MAX_PIXELS: "100000000",
        UPLOAD_ALLOWED_MIME_TYPES: "image/png",
        UPLOAD_SIGNED_URL_TTL_SECONDS: "900",
      }),
    ).toThrow(/OPENAI_PRICING_VERSION|OPENAI_INPUT_COST_MICRO_USD_PER_MILLION/);
  });
});
