import { describe, expect, it } from "bun:test"

import {
  buildQuerySeedOptions,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type SessionDriverOptions,
} from "../src/session-driver.ts"

// `startSession` 自体は本物の claude を子プロセスとして起こすので、ここでは呼ばない
// （docs/requirements.md 4.6 / CLAUDE.md「よく使うコマンド」）。`query()` に渡る `options` の
// うち、クロージャを含まない部分（`buildQuerySeedOptions`）だけを検査する。
const BASE_OPTIONS: SessionDriverOptions = {
  cwd: "/tmp/tsukumo-test",
  expressions: ["default"],
  permissionMode: DEFAULT_PERMISSION_MODE,
  onEvent: () => {},
}

describe("buildQuerySeedOptions", () => {
  it("既定のモデル（opus）と既定の effort（high）を渡す", () => {
    const seed = buildQuerySeedOptions(BASE_OPTIONS)

    expect(seed.model).toBe(DEFAULT_MODEL)
    expect(seed.model).toBe("opus")
    expect(seed.effort).toBe(DEFAULT_EFFORT)
    expect(seed.effort).toBe("high")
  })

  it("cwd・permissionMode は渡された SessionDriverOptions の値をそのまま使う", () => {
    const seed = buildQuerySeedOptions({
      ...BASE_OPTIONS,
      cwd: "/tmp/tsukumo-other",
      permissionMode: "plan",
    })

    expect(seed.cwd).toBe("/tmp/tsukumo-other")
    expect(seed.permissionMode).toBe("plan")
  })
})
