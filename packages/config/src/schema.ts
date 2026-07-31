export const requiredEnvironmentKeys = Object.freeze([
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
]);

export const secretEnvironmentKeys = new Set([
  "S3_SECRET_ACCESS_KEY",
  "OPENAI_API_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
  "TEST_DATABASE_URL",
]);

export const openAiProviderModes = Object.freeze(["mock", "live"]);
export const cookieSameSiteValues = Object.freeze(["lax", "strict", "none"]);

/**
 * @param {string} value
 * @returns {value is ("development" | "test" | "staging" | "production")}
 */
export function isAppEnvironment(value = "") {
  return value === "development" || value === "test" || value === "staging" || value === "production";
}

/**
 * @param {string} value
 * @returns {value is ("development" | "test" | "production")}
 */
export function isNodeEnvironment(value = "") {
  return value === "development" || value === "test" || value === "production";
}
