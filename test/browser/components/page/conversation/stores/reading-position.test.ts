import { afterEach, describe, expect, it } from "vitest"

import {
  rememberedPosition,
  useReadingPosition,
} from "../../../../../../src/browser/components/page/conversation/stores/reading-position.ts"

afterEach(() => {
  useReadingPosition.setState(useReadingPosition.getInitialState(), true)
})

function read(generation: number, turnId: number) {
  return rememberedPosition(useReadingPosition.getState(), generation, turnId)
}

describe("useReadingPosition", () => {
  it("やり取りごとに覚え、同じやり取りは上書きする", () => {
    const { remember } = useReadingPosition.getState()
    remember(0, 1, { headingIndex: 2, offsetPx: -10 })
    remember(0, 2, { headingIndex: 0, offsetPx: 4 })
    remember(0, 1, { headingIndex: 3, offsetPx: 0 })

    expect(read(0, 1)).toEqual({ headingIndex: 3, offsetPx: 0 })
    expect(read(0, 2)).toEqual({ headingIndex: 0, offsetPx: 4 })
  })

  it("forget は指したやり取りだけ忘れる", () => {
    const { remember, forget } = useReadingPosition.getState()
    remember(0, 1, { headingIndex: 1, offsetPx: 0 })
    remember(0, 2, { headingIndex: 1, offsetPx: 0 })

    forget(0, 1)
    expect(read(0, 1)).toBeUndefined()
    expect(read(0, 2)).toBeDefined()
  })

  it("世代が上がったあとは読めない", () => {
    useReadingPosition.getState().remember(3, 1, { headingIndex: 1, offsetPx: 0 })

    expect(read(3, 1)).toBeDefined()
    expect(read(4, 1)).toBeUndefined()
  })

  it("世代が上がったあとに覚えると、古い覚えが消えて新しいものだけ残る", () => {
    const { remember } = useReadingPosition.getState()
    remember(3, 1, { headingIndex: 1, offsetPx: 0 })
    remember(4, 2, { headingIndex: 0, offsetPx: 1 })

    expect(read(4, 1)).toBeUndefined()
    expect(read(4, 2)).toEqual({ headingIndex: 0, offsetPx: 1 })
  })
})
