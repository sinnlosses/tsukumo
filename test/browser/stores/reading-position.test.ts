import { afterEach, describe, expect, it } from "vitest"

import { useReadingPosition } from "../../../src/browser/stores/reading-position.ts"

afterEach(() => {
  useReadingPosition.setState(useReadingPosition.getInitialState(), true)
})

describe("useReadingPosition", () => {
  it("やり取りごとに覚え、同じやり取りは上書きする", () => {
    const { remember } = useReadingPosition.getState()
    remember(1, { headingIndex: 2, offsetPx: -10 })
    remember(2, { headingIndex: 0, offsetPx: 4 })
    remember(1, { headingIndex: 3, offsetPx: 0 })

    expect(useReadingPosition.getState().positions).toEqual({
      1: { headingIndex: 3, offsetPx: 0 },
      2: { headingIndex: 0, offsetPx: 4 },
    })
  })

  it("forget は指したやり取りだけ忘れる", () => {
    const { remember, forget } = useReadingPosition.getState()
    remember(1, { headingIndex: 1, offsetPx: 0 })
    remember(2, { headingIndex: 1, offsetPx: 0 })

    forget(1)
    expect(Object.keys(useReadingPosition.getState().positions)).toEqual(["2"])
  })

  it("同じ世代で呼び直しても残り、世代が変わったら全部忘れる", () => {
    useReadingPosition.getState().forgetUnlessGeneration(3)
    useReadingPosition.getState().remember(1, { headingIndex: 1, offsetPx: 0 })

    useReadingPosition.getState().forgetUnlessGeneration(3)
    expect(Object.keys(useReadingPosition.getState().positions)).toEqual(["1"])

    useReadingPosition.getState().forgetUnlessGeneration(4)
    expect(useReadingPosition.getState().positions).toEqual({})
  })
})
