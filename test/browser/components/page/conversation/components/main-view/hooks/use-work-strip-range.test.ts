import { describe, expect, it } from "vitest"

import { checkedToolUseId } from "../../../../../../../fixture/tool-use-id.ts"
import {
  foldTimed,
  plan,
  workRequest,
  START,
  stripAt,
} from "../../../../../../../fixture/work-strip.ts"

const readStarted = {
  kind: "tool-started",
  toolUseId: checkedToolUseId("toolu_range"),
  name: "Read",
  input: { file_path: "/架空/a.ts" },
  parentToolUseId: undefined,
} as const

describe("useWorkStrip の1行に添える段の範囲", () => {
  it("番号を持つ段で走っている手順には「（1/2 段）」を添える", () => {
    const state = foldTimed([
      [workRequest, START],
      [plan, START + 1_000],
      [readStarted, START + 2_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("a.tsを読んでいる（1/2 段） · 3秒")
  })

  it("段の外の手順には添えない", () => {
    const state = foldTimed([
      [workRequest, START],
      [readStarted, START + 2_000],
    ])

    const strip = stripAt(state, START + 5_000)

    expect(strip.kind === "working" && strip.activity.text).toBe("a.tsを読んでいる · 3秒")
  })
})
