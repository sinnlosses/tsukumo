import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "*.test.ts",
  globalSetup: "./test/built-ui-setup.ts",
  outputDir: "test/e2e/output/playwright",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  fullyParallel: false,
  workers: "40%",
})
