import { defineConfig } from "@playwright/test"

const TRIAL_ROOT = "/tmp/tsukumo-playwright-trial"

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.trial.ts",
  outputDir: `${TRIAL_ROOT}/output`,
  snapshotPathTemplate: `${TRIAL_ROOT}/snapshots/{testFileName}/{arg}{ext}`,
  reporter: [["list"], ["html", { outputFolder: `${TRIAL_ROOT}/report`, open: "never" }]],
  workers: 1,
  use: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
})
