import { expect, it } from "vitest"

import { withOccurrenceKeys } from "../../../src/browser/domain/occurrence-key.ts"

it("同じ中身が並んでも key が重ならず、並びの位置も保つ", () => {
  const keyed = withOccurrenceKeys(["a", "b", "a"], (text) => text)

  expect(keyed.map(({ key }) => key)).toEqual(["a#0", "b#0", "a#1"])
  expect(keyed.map(({ index }) => index)).toEqual([0, 1, 2])
})

it("先頭に足しても、既にある中身の key は動かない", () => {
  const before = withOccurrenceKeys(["x", "y"], (text) => text)
  const after = withOccurrenceKeys(["z", "x", "y"], (text) => text)

  expect(after.slice(1).map(({ key }) => key)).toEqual(before.map(({ key }) => key))
})
