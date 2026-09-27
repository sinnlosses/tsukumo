import { defineConfig } from "vitest/config"

import { cssModuleIdentityPlugin } from "./test/css-module-loader.ts"

// `test/e2e/` は vitest.e2e.config.ts で走らせる。
// 日付の境目を見るテストが UTC を前提にしているので、ホストが JST でも `TZ` を固定する。
export default defineConfig({
  plugins: [cssModuleIdentityPlugin()],
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./test/dom-environment.ts"],
    exclude: ["**/node_modules/**", "test/e2e/**"],
    env: { TZ: "UTC" },
  },
})
