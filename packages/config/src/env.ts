import {
  cookieSameSiteValues,
  isAppEnvironment,
  isNodeEnvironment,
  openAiProviderModes,
  productionRequiredEnvironmentKeys,
  requiredEnvironmentKeys,
  secretEnvironmentKeys,
} from "./schema.js";
// eslint-disable-next-line no-restricted-imports -- The config loader shares the canonical model contract.
import { resolveLlmModel } from "../../core/src/public.js";

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
  readonly openAiModel: string;
  readonly openAiPricingVersion?: string;
  readonly openAiInputCostMicroUsdPerMillion?: number;
  readonly openAiOutputCostMicroUsdPerMillion?: number;
  readonly queuePrefix: string;
  readonly cookieSecure: boolean;
  readonly cookieSameSite: "lax" | "strict" | "none";
  readonly corsAllowedOrigins: readonly string[];
  readonly publicWebUrl?: string;
  readonly publicApiUrl?: string;
  readonly requestBodyLimitBytes: number;
  readonly rateLimitWindowMs: number;
  readonly rateLimitMaxRequests: number;
  readonly uploadMaxBytes: number;
  readonly uploadMaxPixels: number;
  readonly uploadAllowedMimeTypes: readonly string[];
  readonly uploadSignedUrlTtlSeconds: number;
  readonly openAiLiveApproved: boolean;
  readonly openAiMonthlyBudgetUsd?: number;
  readonly openAiSoftStopUsd?: number;
  readonly openAiHardStopUsd?: number;
  readonly openAiMaxConcurrency?: number;
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
    issues.push({
      key: "NODE_ENV",
      message: "must be development, test, or production",
      received: nodeEnvValue,
    });
  }
  const nodeEnv = nodeEnvValue as Environment["nodeEnv"];

  const defaultAppEnv = nodeEnv === "production" ? "production" : nodeEnv;
  const appEnvValue = input.APP_ENV?.trim() || defaultAppEnv;
  if (!isAppEnvironment(appEnvValue)) {
    issues.push({
      key: "APP_ENV",
      message: "must be development, test, staging, or production",
      received: appEnvValue,
    });
  }
  const appEnv = appEnvValue as Environment["appEnv"];

  const isProduction = appEnvValue === "production";
  if (isProduction && nodeEnvValue !== "production") {
    issues.push({ key: "NODE_ENV", message: "must be production when APP_ENV is production" });
  }

  for (const key of requiredEnvironmentKeys) {
    if (key === "TEST_DATABASE_URL" && (appEnv === "staging" || appEnv === "production")) continue;
    if (!input[key]?.trim()) issues.push({ key, message: "required value is missing" });
  }

  if (isProduction) {
    for (const key of productionRequiredEnvironmentKeys) {
      if (!input[key]?.trim())
        issues.push({ key, message: "required in Production; no default is permitted" });
    }
  }

  const openAiProviderModeValue =
    input.OPENAI_PROVIDER_MODE?.trim() || (isProduction ? "" : "mock");
  if (!openAiProviderModes.includes(openAiProviderModeValue)) {
    issues.push({
      key: "OPENAI_PROVIDER_MODE",
      message: "must be mock or live",
      received: openAiProviderModeValue,
    });
  }
  const openAiProviderMode = openAiProviderModeValue as Environment["openAiProviderMode"];

  let openAiModel: string;
  const configuredOpenAiModel = input.OPENAI_MODEL?.trim();
  try {
    if (isProduction && !configuredOpenAiModel)
      throw new Error("OPENAI_MODEL is required in Production");
    openAiModel = resolveLlmModel(configuredOpenAiModel);
  } catch (error) {
    issues.push({
      key: "OPENAI_MODEL",
      message: error instanceof Error ? error.message : "unsupported model",
      ...(configuredOpenAiModel === undefined ? {} : { received: configuredOpenAiModel }),
    });
    openAiModel = resolveLlmModel();
  }
  const openaiApiKey = input.OPENAI_API_KEY?.trim();
  if (openAiProviderMode === "live") {
    if (!openaiApiKey)
      issues.push({ key: "OPENAI_API_KEY", message: "required in live provider mode" });
    if (isProduction && input.OPENAI_LIVE_APPROVED?.trim() !== "true")
      issues.push({
        key: "OPENAI_LIVE_APPROVED",
        message: "must be true for Production Live mode",
      });
  }

  const queuePrefix =
    input.QUEUE_PREFIX?.trim() || (appEnv === "staging" || isProduction ? "" : appEnv);
  if (!queuePrefix) issues.push({ key: "QUEUE_PREFIX", message: "required for staging" });
  if (
    appEnv === "staging" &&
    queuePrefix &&
    !/^plume-staging(?:-[a-z0-9-]+)?$/u.test(queuePrefix)
  ) {
    issues.push({
      key: "QUEUE_PREFIX",
      message: "staging prefix must start with plume-staging",
      received: queuePrefix,
    });
  }
  if (isProduction && /^plume-staging(?:-|$)|^staging(?:-|$)/iu.test(queuePrefix)) {
    issues.push({
      key: "QUEUE_PREFIX",
      message: "staging queue prefixes are forbidden in Production",
    });
  }

  const cookieSecureValue = input.COOKIE_SECURE?.trim();
  const cookieSecure =
    cookieSecureValue === undefined ? nodeEnv === "production" : cookieSecureValue === "true";
  if (
    cookieSecureValue !== undefined &&
    cookieSecureValue !== "true" &&
    cookieSecureValue !== "false"
  ) {
    issues.push({
      key: "COOKIE_SECURE",
      message: "must be true or false",
      received: cookieSecureValue,
    });
  }
  if (appEnv === "staging" && !cookieSecure)
    issues.push({ key: "COOKIE_SECURE", message: "must be true in staging" });
  if (isProduction && input.COOKIE_SECURE?.trim() !== "true")
    issues.push({ key: "COOKIE_SECURE", message: "must be explicitly true in Production" });

  const cookieSameSiteValue =
    input.COOKIE_SAME_SITE?.trim().toLowerCase() || (isProduction ? "" : "lax");
  if (!cookieSameSiteValues.includes(cookieSameSiteValue)) {
    issues.push({
      key: "COOKIE_SAME_SITE",
      message: "must be lax, strict, or none",
      received: cookieSameSiteValue,
    });
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
    issues.push({
      key: "CORS_ALLOWED_ORIGINS",
      message: "at least one exact origin is required in staging",
    });
  }
  if (isProduction && corsAllowedOrigins.length === 0)
    issues.push({
      key: "CORS_ALLOWED_ORIGINS",
      message: "at least one exact HTTPS origin is required in Production",
    });
  if (isProduction && corsAllowedOrigins.some((origin) => !origin.startsWith("https://")))
    issues.push({ key: "CORS_ALLOWED_ORIGINS", message: "Production CORS origins must use HTTPS" });

  const publicWebUrl = input.PUBLIC_WEB_URL?.trim();
  const publicApiUrl = input.PUBLIC_API_URL?.trim();
  if (isProduction && (!publicWebUrl || !publicApiUrl)) {
    issues.push({ key: "PUBLIC_WEB_URL", message: "explicit Production URL contract is required" });
  }
  if (
    isProduction &&
    [publicWebUrl, publicApiUrl].some(
      (value) => value !== undefined && !value.startsWith("https://"),
    )
  ) {
    issues.push({ key: "PUBLIC_WEB_URL", message: "Production public URLs must use HTTPS" });
  }

  const resourceValues = [
    ["DATABASE_URL", input.DATABASE_URL],
    ["REDIS_URL", input.REDIS_URL],
    ["S3_ENDPOINT", input.S3_ENDPOINT],
    ["S3_BUCKET", input.S3_BUCKET],
  ] as const;
  if (isProduction) {
    for (const [key, value] of resourceValues) {
      const normalized = value?.trim().toLowerCase() ?? "";
      if (normalized.includes("localhost") || normalized.includes("127.0.0.1"))
        issues.push({
          key,
          message: "localhost and loopback resources are forbidden in Production",
        });
      if (/(^|[^a-z])(?:staging|plume-staging)(?:$|[^a-z])/iu.test(normalized))
        issues.push({
          key,
          message: "staging resources are forbidden in Production",
        });
      if (
        key === "S3_BUCKET" &&
        /(plume-staging|local|example|test|development)/iu.test(normalized)
      )
        issues.push({
          key,
          message: "Staging, local, test, and example buckets are forbidden in Production",
        });
    }
    const sessionSecret = input.SESSION_SECRET?.trim().toLowerCase() ?? "";
    if (
      !sessionSecret ||
      sessionSecret.includes("development") ||
      sessionSecret.includes("change-me") ||
      sessionSecret.includes("local")
    )
      issues.push({
        key: "SESSION_SECRET",
        message: "a non-development Production secret is required",
      });
  }

  const positiveInteger = (key: string, fallback: number, min = 1): number => {
    const raw = input[key]?.trim();
    if (!raw) {
      if (isProduction)
        issues.push({ key, message: "explicit positive integer is required in Production" });
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min) {
      issues.push({ key, message: `must be an integer >= ${min}` });
      return fallback;
    }
    return value;
  };
  const positiveNumber = (key: string): number | undefined => {
    const raw = input[key]?.trim();
    if (!raw) {
      if (isProduction && openAiProviderMode === "live")
        issues.push({
          key,
          message: "explicit positive number is required in Production Live mode",
        });
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      issues.push({ key, message: "must be a positive number" });
      return undefined;
    }
    return value;
  };
  const requestBodyLimitBytes = positiveInteger("REQUEST_BODY_LIMIT_BYTES", 1_048_576);
  const rateLimitWindowMs = positiveInteger("RATE_LIMIT_WINDOW_MS", 60_000);
  const rateLimitMaxRequests = positiveInteger("RATE_LIMIT_MAX_REQUESTS", 60);
  const uploadMaxBytes = positiveInteger("UPLOAD_MAX_BYTES", 100 * 1024 * 1024);
  const uploadMaxPixels = positiveInteger("UPLOAD_MAX_PIXELS", 100_000_000);
  const uploadSignedUrlTtlSeconds = positiveInteger("UPLOAD_SIGNED_URL_TTL_SECONDS", 900);
  if (uploadSignedUrlTtlSeconds > 900)
    issues.push({
      key: "UPLOAD_SIGNED_URL_TTL_SECONDS",
      message: "must not exceed the signed URL safety ceiling",
    });
  const uploadAllowedMimeTypes = (
    input.UPLOAD_ALLOWED_MIME_TYPES?.trim() || "image/png,image/jpeg,text/csv"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (isProduction && uploadAllowedMimeTypes.length === 0)
    issues.push({
      key: "UPLOAD_ALLOWED_MIME_TYPES",
      message: "at least one MIME type is required in Production",
    });
  const openAiLiveApproved = input.OPENAI_LIVE_APPROVED?.trim() === "true";
  const openAiMonthlyBudgetUsd = positiveNumber("OPENAI_MONTHLY_BUDGET_USD");
  const openAiSoftStopUsd = positiveNumber("OPENAI_SOFT_STOP_USD");
  const openAiHardStopUsd = positiveNumber("OPENAI_HARD_STOP_USD");
  const openAiMaxConcurrency = input.OPENAI_MAX_CONCURRENCY?.trim()
    ? positiveInteger("OPENAI_MAX_CONCURRENCY", 1)
    : undefined;
  const positiveMicroUsdRate = (key: string): number | undefined => {
    const raw = input[key]?.trim();
    if (!raw) {
      if (isProduction && openAiProviderMode === "live")
        issues.push({
          key,
          message: "explicit positive integer micro-USD rate is required in Production Live mode",
        });
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
      issues.push({ key, message: "must be a positive integer micro-USD rate" });
      return undefined;
    }
    return value;
  };
  const openAiPricingVersion = input.OPENAI_PRICING_VERSION?.trim();
  if (isProduction && openAiProviderMode === "live" && !openAiPricingVersion)
    issues.push({
      key: "OPENAI_PRICING_VERSION",
      message: "explicit pricing version is required in Production Live mode",
    });
  const openAiInputCostMicroUsdPerMillion = positiveMicroUsdRate(
    "OPENAI_INPUT_COST_MICRO_USD_PER_MILLION",
  );
  const openAiOutputCostMicroUsdPerMillion = positiveMicroUsdRate(
    "OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION",
  );
  if (isProduction && openAiProviderMode === "live" && openAiMaxConcurrency !== 1)
    issues.push({
      key: "OPENAI_MAX_CONCURRENCY",
      message: "initial Production concurrency must be exactly 1",
    });
  if (
    openAiSoftStopUsd !== undefined &&
    openAiHardStopUsd !== undefined &&
    openAiSoftStopUsd > openAiHardStopUsd
  )
    issues.push({ key: "OPENAI_SOFT_STOP_USD", message: "must not exceed OPENAI_HARD_STOP_USD" });

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
    openAiModel,
    ...(openAiPricingVersion ? { openAiPricingVersion } : {}),
    ...(openAiInputCostMicroUsdPerMillion === undefined
      ? {}
      : { openAiInputCostMicroUsdPerMillion }),
    ...(openAiOutputCostMicroUsdPerMillion === undefined
      ? {}
      : { openAiOutputCostMicroUsdPerMillion }),
    queuePrefix,
    cookieSecure,
    cookieSameSite,
    corsAllowedOrigins,
    ...(publicWebUrl ? { publicWebUrl } : {}),
    ...(publicApiUrl ? { publicApiUrl } : {}),
    requestBodyLimitBytes,
    rateLimitWindowMs,
    rateLimitMaxRequests,
    uploadMaxBytes,
    uploadMaxPixels,
    uploadAllowedMimeTypes: Object.freeze(uploadAllowedMimeTypes),
    uploadSignedUrlTtlSeconds,
    openAiLiveApproved,
    ...(openAiMonthlyBudgetUsd === undefined ? {} : { openAiMonthlyBudgetUsd }),
    ...(openAiSoftStopUsd === undefined ? {} : { openAiSoftStopUsd }),
    ...(openAiHardStopUsd === undefined ? {} : { openAiHardStopUsd }),
    ...(openAiMaxConcurrency === undefined ? {} : { openAiMaxConcurrency }),
    ...(openaiApiKey ? { openaiApiKey } : {}),
  };
}
