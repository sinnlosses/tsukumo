import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    // 単体テスト（vitest.config.ts）と合わせて、並行する作業ツリーが重なってもコア数を超えない本数にする。
    maxWorkers: "30%",
  },
})
