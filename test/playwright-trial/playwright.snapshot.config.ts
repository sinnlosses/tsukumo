import { defineConfig } from "@playwright/test"

const TRIAL_ROOT = "/tmp/tsukumo-playwright-trial-snapshot"
// toMatchSnapshot は名前の "." を "-" に直す（session-switch-enter.messages.json は session-switch-enter-messages.json を探す）。
// 本体の期待値はその名前ではないので、試すときだけ改名した写しをここへ置く（リポジトリの外。--update-snapshots は打たない）
const EXPECTED_ROOT = `${TRIAL_ROOT}/expected`

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.snapshot-trial.ts",
  outputDir: `${TRIAL_ROOT}/output`,
  snapshotPathTemplate: `${EXPECTED_ROOT}/{arg}{ext}`,
  updateSnapshots: "none",
  reporter: [["list"]],
  workers: 1,
  use: {
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    reducedMotion: "reduce",
    trace: "off",
  },
})
