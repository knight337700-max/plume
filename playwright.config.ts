import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "apps/web/e2e",
  testMatch: /(?:jacomo-representative-flow|visual-regression|accessibility)\.spec\.ts/,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "pnpm --filter @plume/web exec vite --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  outputDir: "C:/Users/Lenovo/AppData/Local/Temp/plume-gate-g-results",
});
