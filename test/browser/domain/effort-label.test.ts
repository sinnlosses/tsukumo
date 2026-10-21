import { describe, expect, it } from "vitest"

import { modelEffortNote, resolveEffortSelect } from "../../../src/browser/domain/effort-label.ts"

const OPUS = {
  model: "opus",
  resolvedModel: "claude-opus-5-5",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
} as const
const SONNET = {
  model: "sonnet",
  resolvedModel: "claude-sonnet-5-5",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "max"],
} as const
const HAIKU = {
  model: "haiku",
  resolvedModel: "claude-haiku-4-5-20251001",
  supportsEffort: false,
  effortLevels: [],
} as const

describe("resolveEffortSelect", () => {
  it.each([
    ["対応表がまだ届いていない", "unknown", "opus", [], "high"],
    ["対応表にモデルの行が無い", "unknown", "haiku", [OPUS], "high"],
    ["モデルが対応しない", "unsupported", "haiku", [OPUS, HAIKU], "medium"],
    [
      "対応するのに段が空",
      "unsupported",
      "opus",
      [{ model: "opus", resolvedModel: "claude-opus-5-5", supportsEffort: true, effortLevels: [] }],
      "high",
    ],
    ["まだ読めていない", "unknown", "opus", [OPUS], undefined],
    ["読んだ値がいまのモデルの選べる段に無い", "unknown", "sonnet", [OPUS, SONNET], "xhigh"],
  ] as const)("%s は %s", (_name, kind, model, support, effort) => {
    const select = resolveEffortSelect(model, support, effort)

    expect(select.kind).toBe(kind)
  })

  it("読めていれば、読んだ値と選べる段を返す", () => {
    expect(resolveEffortSelect("sonnet", [OPUS, SONNET], "max")).toEqual({
      kind: "known",
      value: "max",
      options: ["low", "medium", "high", "max"],
    })
  })

  it("正規のモデル ID でも、resolvedModel が等しい行を引く", () => {
    expect(resolveEffortSelect("claude-sonnet-5-5", [OPUS, SONNET], "max")).toMatchObject({
      kind: "known",
      options: SONNET.effortLevels,
    })
  })

  it("名前を含むだけの別のモデルの行は引かない", () => {
    expect(resolveEffortSelect("claude-opus-5-5-x", [OPUS], "high").kind).toBe("unknown")
    expect(resolveEffortSelect("opus", [{ ...OPUS, model: "claude-opus-4-1" }], "high").kind).toBe(
      "unknown",
    )
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
