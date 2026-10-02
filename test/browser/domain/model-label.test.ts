import { describe, expect, it } from "vitest"

import { modelDescription, resolveModelAlias } from "../../../src/browser/domain/model-label.ts"

describe("resolveModelAlias", () => {
  it.each([
    [undefined, "opus"],
    ["fable", "fable"],
    ["opus", "opus"],
    ["sonnet", "sonnet"],
    ["haiku", "haiku"],
    ["claude-sonnet-5", "sonnet"],
    ["claude-fable-5-1", "fable"],
    ["claude-haiku-5", "haiku"],
    ["no-such-model", "opus"],
  ])("%s は %s", (model, expected) => {
    expect(resolveModelAlias(model)).toBe(expected)
  })
})

describe("modelDescription", () => {
  it("重い順に重さが大きい", () => {
    expect(modelDescription("fable").weight).toBeGreaterThan(modelDescription("opus").weight)
    expect(modelDescription("opus").weight).toBeGreaterThan(modelDescription("sonnet").weight)
    expect(modelDescription("sonnet").weight).toBeGreaterThan(modelDescription("haiku").weight)
  })

  it("どのモデルも1行の用途を持つ", () => {
    expect(modelDescription("haiku").summary).not.toBe("")
  })
})
