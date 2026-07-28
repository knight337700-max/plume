import {
  isNodeEnvironment,
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
 * @property {string} databaseUrl
 * @property {string} testDatabaseUrl
 * @property {string} redisUrl
 * @property {string} s3Endpoint
 * @property {string} s3AccessKeyId
 * @property {string} s3SecretAccessKey
 * @property {string} s3Bucket
 * @property {string} [openaiApiKey]
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

  for (const key of requiredEnvironmentKeys) {
    if (!input[key]?.trim()) {
      issues.push({ key, message: "required value is missing" });
    }
  }

  const nodeEnv = input.NODE_ENV?.trim() ?? "development";
  if (!isNodeEnvironment(nodeEnv)) {
    issues.push({ key: "NODE_ENV", message: "must be development, test, or production", received: nodeEnv });
  }

  if (issues.length > 0) {
    throw new EnvironmentValidationError(issues);
  }

  const openaiApiKey = input.OPENAI_API_KEY?.trim();

  return {
    nodeEnv,
    databaseUrl: input.DATABASE_URL?.trim() || "",
    testDatabaseUrl: input.TEST_DATABASE_URL?.trim() || "",
    redisUrl: input.REDIS_URL?.trim() || "",
    s3Endpoint: input.S3_ENDPOINT?.trim() || "",
    s3AccessKeyId: input.S3_ACCESS_KEY_ID?.trim() || "",
    s3SecretAccessKey: input.S3_SECRET_ACCESS_KEY?.trim() || "",
    s3Bucket: input.S3_BUCKET?.trim() || "plume-local",
    ...(openaiApiKey ? { openaiApiKey } : {}),
  };
}
