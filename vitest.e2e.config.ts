import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    globalSetup: [
      "./test/e2e-entry-setup.ts",
      "./test/built-ui-setup.ts",
      "./test/e2e-chrome-setup.ts",
    ],
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    expect: { poll: { timeout: 15_000 } },
    // `scripts/dev/check.ts` は単体テストと並べて走らせるので、vitest.config.ts の 40% と合わせてコア数の 80% に収める。
    maxWorkers: "40%",
  },
})
