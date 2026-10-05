import { describe, expect, it } from "vitest"

import { resolveModelAlias } from "../../../src/browser/domain/model-label.ts"

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
