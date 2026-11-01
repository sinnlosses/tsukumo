import { defineConfig } from "@playwright/test"

import { PLAYWRIGHT_E2E_FILES } from "./scripts/shared/e2e-runner.ts"

const TEST_DIRECTORY = "test/e2e"

export default defineConfig({
  testDir: TEST_DIRECTORY,
  testMatch: PLAYWRIGHT_E2E_FILES.map((file) => file.slice(`${TEST_DIRECTORY}/`.length)),
  globalSetup: "./test/built-ui-setup.ts",
  outputDir: "test/e2e/output/playwright",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  fullyParallel: false,
  workers: "40%",
})
