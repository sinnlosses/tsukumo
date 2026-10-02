import { describe, expect, it } from "vitest"

import { modelEffortNote, resolveEffortSelect } from "../../../src/browser/domain/effort-label.ts"

const OPUS = {
  model: "opus",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
} as const
const SONNET = {
  model: "sonnet",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "max"],
} as const
const HAIKU = { model: "haiku", supportsEffort: false, effortLevels: [] } as const

describe("resolveEffortSelect", () => {
  it.each([
    ["対応表がまだ届いていない", "unknown", "opus", [], "high"],
    ["対応表にモデルの行が無い", "unknown", "haiku", [OPUS], "high"],
    ["モデルが対応しない", "unsupported", "haiku", [OPUS, HAIKU], "medium"],
    [
      "対応するのに段が空",
      "unsupported",
      "opus",
      [{ model: "opus", supportsEffort: true, effortLevels: [] }],
      "high",
    ],
    ["まだ読めていない", "unknown", "opus", [OPUS], undefined],
    ["読んだ値がいまのモデルの選べる段に無い", "unknown", "sonnet", [OPUS, SONNET], "xhigh"],
  ] as const)("%s は %s", (_name, kind, model, support, effort) => {
    const select = resolveEffortSelect(model, support, effort)

    expect(select.kind).toBe(kind)
    expect("reason" in select && select.reason.length > 0).toBe(true)
  })

  it("読めていれば、読んだ値と選べる段を返す", () => {
    expect(resolveEffortSelect("sonnet", [OPUS, SONNET], "max")).toEqual({
      kind: "known",
      value: "max",
      options: ["low", "medium", "high", "max"],
    })
  })

  it("対応表の model がフルネームでも、エイリアスの部分一致で行を引く", () => {
    expect(
      resolveEffortSelect(
        "fable",
        [{ model: "claude-fable-5-1", supportsEffort: true, effortLevels: ["low", "high"] }],
        "high",
      ),
    ).toEqual({ kind: "known", value: "high", options: ["low", "high"] })
  })

  it("完全一致の行を部分一致の行より先に取る", () => {
    const partial = { model: "claude-opus-5", supportsEffort: true, effortLevels: ["low"] } as const

    expect(resolveEffortSelect("opus", [partial, OPUS], "max")).toMatchObject({
      kind: "known",
      options: OPUS.effortLevels,
    })
  })
})

describe("modelEffortNote", () => {
  it("対応しないモデルの行には注意を返す", () => {
    expect(modelEffortNote("haiku", [OPUS, HAIKU])).toBe("effort なし")
  })

  it("対応するモデルの行には何も返さない", () => {
    expect(modelEffortNote("opus", [OPUS, HAIKU])).toBeUndefined()
  })

  it("対応表がまだ届いていないときは分かってもいないことを言わない", () => {
    expect(modelEffortNote("opus", [])).toBeUndefined()
  })
})
