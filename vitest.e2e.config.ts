import { configDefaults, defineConfig } from "vitest/config"

import { PLAYWRIGHT_E2E_FILES } from "./scripts/shared/e2e-runner.ts"

export default defineConfig({
  test: {
    globals: false,
    globalSetup: ["./test/built-ui-setup.ts", "./test/e2e-chrome-setup.ts"],
    include: ["test/e2e/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...PLAYWRIGHT_E2E_FILES],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    expect: { poll: { timeout: 15_000 } },
    // `scripts/dev/check.ts` は単体テストと並べて走らせるので、vitest.config.ts の 40% と合わせてコア数の 80% に収める。
    maxWorkers: "40%",
  },
})
