import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    // `scripts/check.ts` は単体テストと並べて走らせるので、vitest.config.ts の 40% と合わせてコア数に収める。
    maxWorkers: "60%",
  },
})
