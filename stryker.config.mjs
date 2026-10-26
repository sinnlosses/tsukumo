// 作業ツリーを書き換えながら走る（終わると元へ戻す）ので、走っているあいだは編集しない。
import { homedir } from "node:os"
import { join } from "node:path"

// 作業ツリーの中に置くと、文書の検査が JSON を読んで落ちる。macOS は /tmp を起動のたびに空にするので、ホームに置く。
const stateDirectory = join(homedir(), ".cache", "tsukumo-stryker")

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  mutate: ["src/shared/**/*.ts"],
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  concurrency: 4,
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  incremental: true,
  incrementalFile: join(stateDirectory, "incremental.json"),
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: join(stateDirectory, "report.json") },
  thresholds: { high: 80, low: 60, break: null },
  // 複製先の作業場所には git の履歴が無く、git を読むテストが落ちる。TypeScript 7 は Stryker の tsconfig 書き換えも通らない。
  inPlace: true,
}
