import { defineConfig } from "vitest/config"

import { cssModuleIdentityPlugin } from "./test/css-module-loader.ts"

// `test/e2e/` は vitest.e2e.config.ts で走らせる。
// 日付の境目を見るテストが UTC を前提にしているので、ホストが JST でも `TZ` を固定する。
// React Compiler は足さない。`@vitejs/plugin-react` の `compiler` は consumer が `client` の環境にだけ効き、
// Vitest の実行（`ssr: true` の変換）には掛からないので、足しても効かない。
export default defineConfig({
  plugins: [cssModuleIdentityPlugin()],
  test: {
    globals: false,
    globalSetup: ["./test/check-lock-setup.ts"],
    environment: "node",
    setupFiles: ["./test/dom-environment.ts"],
    exclude: ["**/node_modules/**", "test/e2e/**"],
    // hook を起こすテストが、実物の拒否の記録に足さないようにする。
    env: { TZ: "UTC", TSUKUMO_HOOK_DENIAL_RECORD: "off" },
    maxWorkers: "30%",
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
