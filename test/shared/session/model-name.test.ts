import { describe, expect, it } from "vitest"

import { findModelSupport, sameModel } from "../../../src/shared/session/model-name.ts"

const SONNET = {
  model: "sonnet",
  resolvedModel: "claude-sonnet-5-5",
  supportsEffort: true,
  effortLevels: ["low"],
} as const
const DEFAULT = { ...SONNET, model: "default" } as const
const OPUS = {
  model: "opus",
  resolvedModel: "claude-opus-5-5",
  supportsEffort: true,
  effortLevels: ["low"],
} as const

describe("sameModel", () => {
  it("文字列が等しければ表が空でも同じ", () => {
    expect(sameModel([], "claude-opus-4", "claude-opus-4")).toBe(true)
  })

  it("別名と正規の ID は、表で同じ ID に引けるときだけ同じ", () => {
    expect(sameModel([SONNET, OPUS], "sonnet", "claude-sonnet-5-5")).toBe(true)
    expect(sameModel([SONNET, DEFAULT], "default", "sonnet")).toBe(true)
    expect(sameModel([], "sonnet", "claude-sonnet-5-5")).toBe(false)
  })

  it("片方がもう片方を含む別のモデルは違う", () => {
    expect(sameModel([OPUS], "opus", "claude-opus-4-1")).toBe(false)
    expect(sameModel([], "claude-opus-4", "claude-opus-4-1")).toBe(false)
    expect(sameModel([SONNET, OPUS], "sonnet", "opus")).toBe(false)
  })
})

describe("findModelSupport", () => {
  it("model の一致を先に、無ければ resolvedModel の一致で引く", () => {
    expect(findModelSupport([SONNET, OPUS], "opus")).toBe(OPUS)
    expect(findModelSupport([SONNET, OPUS], "claude-opus-5-5")).toBe(OPUS)
    expect(findModelSupport([SONNET, OPUS], "claude-opus-5")).toBeUndefined()
  })
})
