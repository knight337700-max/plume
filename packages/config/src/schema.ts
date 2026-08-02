export const requiredEnvironmentKeys = Object.freeze([
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
]);

export const productionRequiredEnvironmentKeys = Object.freeze([
  "DATABASE_URL",
  "REDIS_URL",
  "QUEUE_PREFIX",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SESSION_SECRET",
  "CORS_ALLOWED_ORIGINS",
  "COOKIE_SECURE",
  "COOKIE_SAME_SITE",
  "OPENAI_PROVIDER_MODE",
  "OPENAI_MODEL",
  "PUBLIC_WEB_URL",
  "PUBLIC_API_URL",
  "REQUEST_BODY_LIMIT_BYTES",
  "RATE_LIMIT_WINDOW_MS",
  "RATE_LIMIT_MAX_REQUESTS",
  "UPLOAD_MAX_BYTES",
  "UPLOAD_MAX_PIXELS",
  "UPLOAD_ALLOWED_MIME_TYPES",
  "UPLOAD_SIGNED_URL_TTL_SECONDS",
]);

export const secretEnvironmentKeys = new Set([
  "S3_SECRET_ACCESS_KEY",
  "OPENAI_API_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
]);

export const openAiProviderModes = Object.freeze(["mock", "live"]);
export const cookieSameSiteValues = Object.freeze(["lax", "strict", "none"]);

/**
 * @param {string} value
 * @returns {value is ("development" | "test" | "staging" | "production")}
 */
export function isAppEnvironment(value = "") {
  return (
    value === "development" || value === "test" || value === "staging" || value === "production"
  );
}

/**
 * @param {string} value
 * @returns {value is ("development" | "test" | "production")}
 */
export function isNodeEnvironment(value = "") {
  return value === "development" || value === "test" || value === "production";
}
