import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "apps/web/e2e",
  testMatch: /jacomo-user-upload\.spec\.ts/,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    {
      command:
        "node --experimental-transform-types --experimental-loader ./tools/qa/local-ts-loader.mjs tools/qa/local-upload-api.ts",
      url: "http://127.0.0.1:3000/api/v1/health/live",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @plume/web exec vite --config vite.qa.config.ts --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173/e2e/jacomo-user-upload",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  outputDir: join(tmpdir(), "plume-gate-i-2-6a-results"),
});
