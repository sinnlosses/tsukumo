import { globSync, readFileSync } from "node:fs"

import { defineConfig } from "vitest/config"

import { WITHOUT_UNUSED_EXPORT_ENV } from "./scripts/dev/lib/check-stage.ts"
import { CONVENTION_TEST_PATHS } from "./scripts/dev/lib/convention-test.ts"
import { REPOSITORY_SCAN_TIMEOUT_MS } from "./test/fixture/repository-scan-timeout.ts"

// DOM のグローバルを借りるテスト。ほかのテストには happy-dom を読ませない。
export const DOM_TEST_FILES = [
  "test/browser/**/*.test.{ts,tsx}",
  "test/server/report/core/prompt/report-notation.test.ts",
]

// どのテストからも import されない準備のファイル。`forceRerunTriggers` にも載せ、変えたときの関連の絞り込み（`vitest related`）を全件に戻す。
const GLOBAL_SETUP_FILES = [
  "./test/tsukumo-home-setup.ts",
  "./test/beads-template-setup.ts",
  "./test/architecture/source-table-setup.ts",
]
const CONVENTION_TEST_GLOBS = CONVENTION_TEST_PATHS.map(
  (directory) => `${directory}**/*.test.{ts,tsx}`,
)
const DOM_SETUP_FILES = ["./test/dom-setup.ts", "./test/popover-setup.ts"]

// 分離を外した worker では、モジュールの記録・環境変数・グローバル・作業ディレクトリが前のファイルから持ち越される。
// 持ち越すと効かなくなる差し替えを書いたファイルだけを、分離したまま走らせる。
const WORKER_STATE_REWRITE =
  /\bvi\.(?:mock|doMock|resetModules|stubEnv|stubGlobal)\(|process\.chdir\(/

const NODE_REWRITING_TEST_FILES = globSync("test/**/*.test.{ts,tsx}", {
  exclude: ["test/e2e/**", ...DOM_TEST_FILES],
}).filter((file) => WORKER_STATE_REWRITE.test(readFileSync(file, "utf8")))

const NODE_TEST_EXCLUDE = [
  "**/node_modules/**",
  "test/e2e/**",
  ...DOM_TEST_FILES,
  ...CONVENTION_TEST_GLOBS,
]

// 指定すると既定の2つ（package.json・vitest/vite の設定）が上書きされるので、先頭に書き足す。
const FORCE_RERUN_TRIGGERS = [
  "**/package.json",
  "**/{vitest,vite}.config.*",
  ...[...GLOBAL_SETUP_FILES, ...DOM_SETUP_FILES].map((file) => `**/${file.replace("./", "")}`),
]

// `test/e2e/` は playwright.config.ts で走らせる。
// 日付の境目を見るテストが UTC を前提にしているので、ホストが JST でも `TZ` を固定する。
// React Compiler は足さない。`@vitejs/plugin-react` の `compiler` は consumer が `client` の環境にだけ効き、
// Vitest の実行（`ssr: true` の変換）には掛からないので、足しても効かない。
export default defineConfig({
  test: {
    css: { modules: { classNameStrategy: "non-scoped" } },
    globals: false,
    // `vi.spyOn` の差し替えを、it のたびに元へ戻す。
    restoreMocks: true,
    environment: "node",
    // hook を起こすテストが、実物の拒否の記録に足さないようにする。
    env: { TZ: "UTC", TSUKUMO_HOOK_DENIAL_RECORD: "off" },
    globalSetup: GLOBAL_SETUP_FILES,
    forceRerunTriggers: FORCE_RERUN_TRIGGERS,
    maxWorkers: "40%",
    projects: [
      // 分離を外すと、ストアや document の持ち越しで順によって落ちるファイルがあるので、分離したまま走らせる。
      {
        extends: true,
        test: {
          name: "dom",
          include: DOM_TEST_FILES,
          environment: "happy-dom",
          environmentOptions: {
            happyDOM: { url: "http://127.0.0.1/", settings: { disableCSSFileLoading: true } },
          },
          setupFiles: DOM_SETUP_FILES,
        },
      },
      // ファイルごとの環境の作り直しと import のやり直しを省く。
      {
        extends: true,
        test: {
          name: "node",
          isolate: false,
          exclude: [...NODE_TEST_EXCLUDE, ...NODE_REWRITING_TEST_FILES],
        },
      },
      {
        extends: true,
        test: {
          name: "node-isolated",
          include: NODE_REWRITING_TEST_FILES,
          exclude: NODE_TEST_EXCLUDE,
        },
      },
      // リポジトリ全体を読むので、並べて走る検証の負荷で既定の 5 秒を超える。
      {
        extends: true,
        test: {
          name: "convention",
          include: CONVENTION_TEST_GLOBS,
          exclude: [
            "**/node_modules/**",
            ...(process.env[WITHOUT_UNUSED_EXPORT_ENV] === "1"
              ? ["test/architecture/unused-export.test.ts"]
              : []),
          ],
          testTimeout: REPOSITORY_SCAN_TIMEOUT_MS,
        },
      },
    ],
    // E2E の段と並べて走らせるので、bd init と bundle の組み立てを済ませる beforeAll が10秒の既定に収まらないことがある。
    hookTimeout: 15_000,
    // `pnpm run test:coverage` のときだけ効く。報告はリポジトリの外に書く。
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "/tmp/tsukumo-coverage",
    },
  },
})
