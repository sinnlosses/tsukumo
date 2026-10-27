import { describe, expect, it } from "vitest"

import {
  createToolHookClock,
  toolHookDurationTool,
} from "../../../../src/server/session-driver/core/tool-hook-clock.ts"

describe("createToolHookClock", () => {
  it("控えた呼び出しの結果を受けたら、ツール本体の時間を除いたミリ秒を返し、控えを消す", () => {
    let time = 100
    const clock = createToolHookClock(() => time)
    clock.started("t-1")
    time = 400
    expect(clock.finished("t-1", 250)).toEqual({ kind: "measured", beforeToolMs: 50 })
    expect(clock.finished("t-1", 250)).toEqual({ kind: "unseen" })
  })

  it("控えが上限を超えたら古いものから捨てる", () => {
    const clock = createToolHookClock(() => 0)
    for (let index = 0; index <= 64; index += 1) {
      clock.started(`t-${String(index)}`)
    }
    expect(clock.finished("t-0", 0)).toEqual({ kind: "unseen" })
    expect(clock.finished("t-64", 0)).toEqual({ kind: "measured", beforeToolMs: 0 })
  })
})

describe("toolHookDurationTool", () => {
  it("表にある組み込みはそのまま、phase_result とほかの MCP と知らない名前は決まった語に写す", () => {
    expect(toolHookDurationTool("Bash")).toBe("Bash")
    expect(toolHookDurationTool("mcp__tsukumo__phase_result")).toBe("phase_result")
    expect(toolHookDurationTool("mcp__other__tool")).toBe("mcp")
    expect(toolHookDurationTool("架空のツール")).toBe("other")
  })
})
