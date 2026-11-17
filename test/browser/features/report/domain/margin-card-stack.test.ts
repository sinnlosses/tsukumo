import { describe, expect, it } from "vitest"

import {
  blocksBesideCards,
  stackMarginCards,
} from "../../../../../src/browser/features/report/domain/margin-card-stack.ts"

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

describe("blocksBesideCards", () => {
  const card = { top: 100, bottom: 300, left: 480, holders: [0] }

  it("札の縦の範囲に掛かる塊だけが当たり、札を中に持つ塊は当たらない", () => {
    const beside = blocksBesideCards(
      [
        { top: 80, bottom: 140, right: 720 },
        { top: 150, bottom: 200, right: 720 },
        { top: 210, bottom: 400, right: 720 },
        { top: 410, bottom: 500, right: 720 },
      ],
      [card],
      8,
    )

    expect(beside).toEqual([false, true, true, false])
  })

  it("札との間（gap）に入る塊も当たる", () => {
    const beside = blocksBesideCards(
      [
        { top: 0, bottom: 95, right: 720 },
        { top: 305, bottom: 400, right: 720 },
        { top: 308, bottom: 400, right: 720 },
      ],
      [{ ...card, holders: [] }],
      8,
    )

    expect(beside).toEqual([true, true, false])
  })

  it("右端が札の左端に届かない塊は当たらない", () => {
    const beside = blocksBesideCards(
      [
        { top: 150, bottom: 200, right: 480 },
        { top: 150, bottom: 200, right: 481 },
      ],
      [{ ...card, holders: [] }],
      8,
    )

    expect(beside).toEqual([false, true])
  })

  it("札が無ければ、どの塊も当たらない", () => {
    expect(blocksBesideCards([{ top: 0, bottom: 100, right: 720 }], [], 8)).toEqual([false])
  })
})
