import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    // Allows pinning a preinstalled Chromium build in sandboxes/CI images
    // where the auto-downloaded shell lacks system libraries.
    launchOptions: process.env.E2E_CHROMIUM_PATH
      ? { executablePath: process.env.E2E_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],

});
