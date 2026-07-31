import {
  cookieSameSiteValues,
  isAppEnvironment,
  isNodeEnvironment,
  openAiProviderModes,
  requiredEnvironmentKeys,
  secretEnvironmentKeys,
} from "./schema.js";

/**
 * @typedef {object} EnvironmentIssue
 * @property {string} key
 * @property {string} message
 * @property {string} [received]
 */

/**
 * @typedef {object} Environment
 * @property {"development" | "test" | "production"} nodeEnv
 * @property {"development" | "test" | "staging" | "production"} appEnv
 * @property {string} databaseUrl
 * @property {string} testDatabaseUrl
 * @property {string} redisUrl
 * @property {string} s3Endpoint
 * @property {string} s3AccessKeyId
 * @property {string} s3SecretAccessKey
 * @property {string} s3Bucket
 * @property {string} [openaiApiKey]
 * @property {"mock" | "live"} openAiProviderMode
 * @property {string | undefined} openAiDefaultModel
 * @property {string} queuePrefix
 * @property {boolean} cookieSecure
 * @property {"lax" | "strict" | "none"} cookieSameSite
 * @property {readonly string[]} corsAllowedOrigins
 */

export class EnvironmentValidationError extends Error {
  /** @param {readonly EnvironmentIssue[]} issues */
  constructor(issues) {
    super(formatEnvironmentIssues(issues));
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

/** @param {readonly EnvironmentIssue[]} issues */
export function formatEnvironmentIssues(issues) {
  return issues
    .map((issue) => {
      const received = secretEnvironmentKeys.has(issue.key)
        ? "[REDACTED]"
        : (issue.received ?? "<missing>");
      return `${issue.key}: ${issue.message} (received: ${received})`;
    })
    .join("\n");
}

/**
 * @param {Readonly<Record<string, string | undefined>>} input
 * @returns {Environment}
 */
export function loadEnvironment(input = {}) {
  /** @type {EnvironmentIssue[]} */
  const issues = [];

  const nodeEnv = input.NODE_ENV?.trim() ?? "development";
  if (!isNodeEnvironment(nodeEnv)) {
    issues.push({ key: "NODE_ENV", message: "must be development, test, or production", received: nodeEnv });
  }

  const defaultAppEnv = nodeEnv === "production" ? "production" : nodeEnv;
  const appEnv = input.APP_ENV?.trim() || defaultAppEnv;
  if (!isAppEnvironment(appEnv)) {
    issues.push({ key: "APP_ENV", message: "must be development, test, staging, or production", received: appEnv });
  }

  for (const key of requiredEnvironmentKeys) {
    if (key === "TEST_DATABASE_URL" && (appEnv === "staging" || appEnv === "production")) continue;
    if (!input[key]?.trim()) issues.push({ key, message: "required value is missing" });
  }

  const openAiProviderMode = input.OPENAI_PROVIDER_MODE?.trim() || "mock";
  if (!openAiProviderModes.includes(openAiProviderMode)) {
    issues.push({ key: "OPENAI_PROVIDER_MODE", message: "must be mock or live", received: openAiProviderMode });
  }

  const openAiDefaultModel = input.OPENAI_DEFAULT_MODEL?.trim() || undefined;
  const openaiApiKey = input.OPENAI_API_KEY?.trim();
  if (openAiProviderMode === "live") {
    if (!openaiApiKey) issues.push({ key: "OPENAI_API_KEY", message: "required in live provider mode" });
    if (!openAiDefaultModel) issues.push({ key: "OPENAI_DEFAULT_MODEL", message: "required in live provider mode" });
  }

  const queuePrefix = input.QUEUE_PREFIX?.trim() || (appEnv === "staging" ? "" : appEnv);
  if (!queuePrefix) issues.push({ key: "QUEUE_PREFIX", message: "required for staging" });
  if (appEnv === "staging" && queuePrefix && !/^plume-staging(?:-[a-z0-9-]+)?$/u.test(queuePrefix)) {
    issues.push({ key: "QUEUE_PREFIX", message: "staging prefix must start with plume-staging", received: queuePrefix });
  }

  const cookieSecureValue = input.COOKIE_SECURE?.trim();
  const cookieSecure = cookieSecureValue === undefined ? nodeEnv === "production" : cookieSecureValue === "true";
  if (cookieSecureValue !== undefined && cookieSecureValue !== "true" && cookieSecureValue !== "false") {
    issues.push({ key: "COOKIE_SECURE", message: "must be true or false", received: cookieSecureValue });
  }
  if (appEnv === "staging" && !cookieSecure) issues.push({ key: "COOKIE_SECURE", message: "must be true in staging" });

  const cookieSameSite = input.COOKIE_SAME_SITE?.trim().toLowerCase() || "lax";
  if (!cookieSameSiteValues.includes(cookieSameSite)) {
    issues.push({ key: "COOKIE_SAME_SITE", message: "must be lax, strict, or none", received: cookieSameSite });
  }

  const corsAllowedOrigins = (input.CORS_ALLOWED_ORIGINS?.trim() || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsAllowedOrigins.some((origin) => origin.includes("*"))) {
    issues.push({ key: "CORS_ALLOWED_ORIGINS", message: "wildcard origins are forbidden" });
  }
  if (appEnv === "staging" && corsAllowedOrigins.length === 0) {
    issues.push({ key: "CORS_ALLOWED_ORIGINS", message: "at least one exact origin is required in staging" });
  }

  if (issues.length > 0) {
    throw new EnvironmentValidationError(issues);
  }

  return {
    nodeEnv,
    appEnv,
    databaseUrl: input.DATABASE_URL?.trim() || "",
    testDatabaseUrl: input.TEST_DATABASE_URL?.trim() || "",
    redisUrl: input.REDIS_URL?.trim() || "",
    s3Endpoint: input.S3_ENDPOINT?.trim() || "",
    s3AccessKeyId: input.S3_ACCESS_KEY_ID?.trim() || "",
    s3SecretAccessKey: input.S3_SECRET_ACCESS_KEY?.trim() || "",
    s3Bucket: input.S3_BUCKET?.trim() || "plume-local",
    openAiProviderMode,
    ...(openAiDefaultModel ? { openAiDefaultModel } : {}),
    queuePrefix,
    cookieSecure,
    cookieSameSite,
    corsAllowedOrigins,
    ...(openaiApiKey ? { openaiApiKey } : {}),
  };
}
