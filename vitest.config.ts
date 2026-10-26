import { defineConfig } from "vitest/config"

// DOM のグローバルを借りるテスト。ほかのテストには happy-dom を読ませない。
export const DOM_TEST_FILES = [
  "test/browser/**/*.test.{ts,tsx}",
  "test/server/report/core/report-notation.test.ts",
]

// `test/e2e/` は vitest.e2e.config.ts で走らせる。
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
    globalSetup: ["./test/tsukumo-home-setup.ts", "./test/beads-template-setup.ts"],
    maxWorkers: "40%",
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          include: DOM_TEST_FILES,
          environment: "happy-dom",
          environmentOptions: {
            happyDOM: { url: "http://127.0.0.1/", settings: { disableCSSFileLoading: true } },
          },
          setupFiles: ["./test/dom-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          exclude: ["**/node_modules/**", "test/e2e/**", ...DOM_TEST_FILES],
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
