import { describe, expect, it } from "vitest"

import { stackMarginCards } from "../../../../../src/browser/features/report/domain/margin-card-stack.ts"

describe("stackMarginCards", () => {
  it("重ならない札は単位の上端のまま置く", () => {
    const placed = stackMarginCards(
      [
        { id: "a", top: 0, height: 100 },
        { id: "b", top: 200, height: 50 },
      ],
      8,
    )

    expect(placed.map((card) => card.top)).toEqual([0, 200])
  })

  it("前の札の下端と間に重なる札は、その下へずらす", () => {
    const placed = stackMarginCards(
      [
        { id: "a", top: 10, height: 100 },
        { id: "b", top: 50, height: 40 },
        { id: "c", top: 60, height: 40 },
      ],
      8,
    )

    expect(placed.map((card) => card.top)).toEqual([10, 118, 166])
  })

  it("渡された順に関わらず、単位の上端の順に並べる", () => {
    const placed = stackMarginCards(
      [
        { id: "late", top: 300, height: 20 },
        { id: "early", top: 100, height: 20 },
      ],
      8,
    )

    expect(placed.map((card) => card.id)).toEqual(["early", "late"])
  })
})
