import { afterEach, describe, expect, it } from "vitest"

import { nextReadingDepth, useReadingDepth } from "../../../src/browser/stores/reading-depth.ts"

afterEach(() => {
  useReadingDepth.setState(useReadingDepth.getInitialState(), true)
})

describe("useReadingDepth", () => {
  it("既定は本文で、何も畳んでいない", () => {
    expect(useReadingDepth.getState().depth).toBe(2)
    expect([...useReadingDepth.getState().foldedSections]).toEqual([])
  })

  it("d で回す先は 1 → 2 → 3 → 1", () => {
    expect(([1, 2, 3] as const).map((depth) => nextReadingDepth(depth))).toEqual([2, 3, 1])
  })

  it("節1つの畳みは押すたびに入れ替わる", () => {
    const { toggleFold } = useReadingDepth.getState()
    toggleFold({ kind: "section", key: "1:0" })
    expect([...useReadingDepth.getState().foldedSections]).toEqual(["1:0"])
    toggleFold({ kind: "section", key: "1:0" })
    expect([...useReadingDepth.getState().foldedSections]).toEqual([])
  })

  it("全節は、1つでも開いていれば全部を畳み、全部畳んでいれば全部を開く", () => {
    const { toggleFold } = useReadingDepth.getState()
    toggleFold({ kind: "section", key: "1:0" })
    toggleFold({ kind: "all", keys: ["1:0", "1:1"] })
    expect([...useReadingDepth.getState().foldedSections].toSorted()).toEqual(["1:0", "1:1"])
    toggleFold({ kind: "all", keys: ["1:0", "1:1"] })
    expect([...useReadingDepth.getState().foldedSections]).toEqual([])
  })
})
