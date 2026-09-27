import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
    // ファイルごとに tsukumo とブラウザを起こすので、並べると負荷で待ちが揺れて落ちる。
    fileParallelism: false,
  },
})
