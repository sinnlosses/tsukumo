import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    globalSetup: ["./test/built-ui-setup.ts", "./test/check-lock-setup.ts"],
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    // `scripts/check.ts` は単体テストと並べて走らせるので、vitest.config.ts の 30% と合わせてコア数の 60% に収める。
    maxWorkers: "30%",
  },
})
