import { describe, expect, it } from "vitest"

import { modelLabel, resolveShownModel } from "../../../src/browser/domain/model-label.ts"

const entry = (model: string, resolvedModel: string) =>
  ({ model, resolvedModel, supportsEffort: true, effortLevels: ["low"] }) as const

const SUPPORT = [
  entry("opus", "claude-opus-5-5"),
  entry("fable", "claude-fable-5-1"),
  entry("sonnet", "claude-sonnet-5-5"),
  entry("haiku", "claude-haiku-4-5-20251001"),
]

describe("resolveShownModel", () => {
  it.each([
    [undefined, SUPPORT, "opus"],
    ["fable", SUPPORT, "fable"],
    ["claude-sonnet-5-5", SUPPORT, "sonnet"],
    ["claude-fable-5-1", SUPPORT, "fable"],
    ["claude-haiku-4-5-20251001", SUPPORT, "haiku"],
    ["claude-sonnet-5-5", [], "claude-sonnet-5-5"],
    ["claude-opus-4-8", SUPPORT, "claude-opus-4-8"],
    ["no-such-model", SUPPORT, "no-such-model"],
  ])("%s は %j の表で %s", (model, support, expected) => {
    expect(resolveShownModel(model, support)).toBe(expected)
  })
})

describe("modelLabel", () => {
  it("エイリアスは日本語ラベル、知らない名前はそのまま", () => {
    expect(modelLabel("sonnet")).toBe("Sonnet")
    expect(modelLabel("claude-opus-4-8")).toBe("claude-opus-4-8")
  })
})
