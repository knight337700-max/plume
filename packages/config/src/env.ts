import {
  cookieSameSiteValues,
  isAppEnvironment,
  isNodeEnvironment,
  openAiProviderModes,
  requiredEnvironmentKeys,
  secretEnvironmentKeys,
} from "./schema.js";

export interface EnvironmentIssue {
  readonly key: string;
  readonly message: string;
  readonly received?: string;
}

export interface Environment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly appEnv: "development" | "test" | "staging" | "production";
  readonly databaseUrl: string;
  readonly testDatabaseUrl: string;
  readonly redisUrl: string;
  readonly s3Endpoint: string;
  readonly s3AccessKeyId: string;
  readonly s3SecretAccessKey: string;
  readonly s3Bucket: string;
  readonly openaiApiKey?: string;
  readonly openAiProviderMode: "mock" | "live";
  readonly openAiDefaultModel?: string;
  readonly queuePrefix: string;
  readonly cookieSecure: boolean;
  readonly cookieSameSite: "lax" | "strict" | "none";
  readonly corsAllowedOrigins: readonly string[];
}

export class EnvironmentValidationError extends Error {
  public readonly issues: readonly EnvironmentIssue[];

  constructor(issues: readonly EnvironmentIssue[]) {
    super(formatEnvironmentIssues(issues));
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

export function formatEnvironmentIssues(issues: readonly EnvironmentIssue[]): string {
  return issues
    .map((issue) => {
      const received = secretEnvironmentKeys.has(issue.key)
        ? "[REDACTED]"
        : (issue.received ?? "<missing>");
      return `${issue.key}: ${issue.message} (received: ${received})`;
    })
    .join("\n");
}

export function loadEnvironment(
  input: Readonly<Record<string, string | undefined>> = {},
): Environment {
  const issues: EnvironmentIssue[] = [];

  const nodeEnvValue = input.NODE_ENV?.trim() ?? "development";
  if (!isNodeEnvironment(nodeEnvValue)) {
    issues.push({ key: "NODE_ENV", message: "must be development, test, or production", received: nodeEnvValue });
  }
  const nodeEnv = nodeEnvValue as Environment["nodeEnv"];

  const defaultAppEnv = nodeEnv === "production" ? "production" : nodeEnv;
  const appEnvValue = input.APP_ENV?.trim() || defaultAppEnv;
  if (!isAppEnvironment(appEnvValue)) {
    issues.push({ key: "APP_ENV", message: "must be development, test, staging, or production", received: appEnvValue });
  }
  const appEnv = appEnvValue as Environment["appEnv"];

  for (const key of requiredEnvironmentKeys) {
    if (key === "TEST_DATABASE_URL" && (appEnv === "staging" || appEnv === "production")) continue;
    if (!input[key]?.trim()) issues.push({ key, message: "required value is missing" });
  }

  const openAiProviderModeValue = input.OPENAI_PROVIDER_MODE?.trim() || "mock";
  if (!openAiProviderModes.includes(openAiProviderModeValue)) {
    issues.push({ key: "OPENAI_PROVIDER_MODE", message: "must be mock or live", received: openAiProviderModeValue });
  }
  const openAiProviderMode = openAiProviderModeValue as Environment["openAiProviderMode"];

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

  const cookieSameSiteValue = input.COOKIE_SAME_SITE?.trim().toLowerCase() || "lax";
  if (!cookieSameSiteValues.includes(cookieSameSiteValue)) {
    issues.push({ key: "COOKIE_SAME_SITE", message: "must be lax, strict, or none", received: cookieSameSiteValue });
  }
  const cookieSameSite = cookieSameSiteValue as Environment["cookieSameSite"];

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
