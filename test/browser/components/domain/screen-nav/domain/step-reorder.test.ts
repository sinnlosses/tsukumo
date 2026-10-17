import { describe, expect, it } from "vitest"

import {
  dropIndexAt,
  dropLineSlot,
  nextStepGrab,
  reorderSteps,
  type StepGrab,
} from "../../../../../../src/browser/components/domain/screen-nav/domain/step-reorder.ts"

const STEPS = ["a", "b", "c", "d"]

/** 高さ 40・間 10 で縦に並んだ4行（中点は 20・70・120・170）。 */
const ROWS = [
  { top: 0, bottom: 40 },
  { top: 50, bottom: 90 },
  { top: 100, bottom: 140 },
  { top: 150, bottom: 190 },
]

describe("reorderSteps", () => {
  it("末尾の行を先頭へ動かす", () => {
    expect(reorderSteps(STEPS, 3, 0)).toEqual(["d", "a", "b", "c"])
  })

  it("先頭の行を末尾へ動かす", () => {
    expect(reorderSteps(STEPS, 0, 3)).toEqual(["b", "c", "d", "a"])
  })

  it("真ん中の行を1つ下へ動かす", () => {
    expect(reorderSteps(STEPS, 1, 2)).toEqual(["a", "c", "b", "d"])
  })

  it("同じ位置へ動かすと並びは変わらない", () => {
    expect(reorderSteps(STEPS, 2, 2)).toEqual(STEPS)
  })

  it("範囲の外の添字では並びを変えない", () => {
    expect(reorderSteps(STEPS, 4, 0)).toEqual(STEPS)
    expect(reorderSteps(STEPS, 0, -1)).toEqual(STEPS)
  })

  it("渡した並びは書き換えない", () => {
    const steps = [...STEPS]
    reorderSteps(steps, 0, 3)
    expect(steps).toEqual(STEPS)
  })
})

describe("dropIndexAt", () => {
  it("先頭の行の中点より上なら先頭", () => {
    expect(dropIndexAt(ROWS, 2, 5)).toBe(0)
    expect(dropIndexAt(ROWS, 2, -100)).toBe(0)
  })

  it("末尾の行の中点より下なら末尾", () => {
    expect(dropIndexAt(ROWS, 0, 180)).toBe(3)
    expect(dropIndexAt(ROWS, 0, 1000)).toBe(3)
  })

  it("つかんだ行の上で離せば同じ位置", () => {
    expect(dropIndexAt(ROWS, 1, 55)).toBe(1)
    expect(dropIndexAt(ROWS, 1, 85)).toBe(1)
  })

  it("下の行の中点を越えると、その行の位置へ下りる", () => {
    expect(dropIndexAt(ROWS, 0, 69)).toBe(0)
    expect(dropIndexAt(ROWS, 0, 71)).toBe(1)
  })

  it("上の行の中点を越えると、その行の位置へ上がる", () => {
    expect(dropIndexAt(ROWS, 3, 121)).toBe(3)
    expect(dropIndexAt(ROWS, 3, 119)).toBe(2)
  })
})

describe("dropLineSlot", () => {
  it("上へ動かすときは、置き場所の行の上に線を引く", () => {
    expect(dropLineSlot(3, 0)).toBe(0)
    expect(dropLineSlot(2, 1)).toBe(1)
  })

  it("下へ動かすときは、置き場所の行の下に線を引く", () => {
    expect(dropLineSlot(0, 3)).toBe(4)
    expect(dropLineSlot(0, 1)).toBe(2)
  })

  it("同じ位置なら、つかんだ行の上", () => {
    expect(dropLineSlot(2, 2)).toBe(2)
  })
})

describe("nextStepGrab", () => {
  const idle: StepGrab = { kind: "idle" }

  it("Space でつかむと、つかんだ行の位置に置き場所がある", () => {
    expect(nextStepGrab(idle, 1, "toggle", 4)).toEqual({
      grab: { kind: "grabbed", from: 1, to: 1 },
      outcome: { kind: "none" },
    })
  })

  it("つかむ前の ↑↓・Esc は何もしない", () => {
    for (const action of ["up", "down", "cancel"] as const) {
      expect(nextStepGrab(idle, 1, action, 4)).toEqual({ grab: idle, outcome: { kind: "none" } })
    }
  })

  it("↑↓ で置き場所が動き、先頭・末尾で止まる", () => {
    const grabbed: StepGrab = { kind: "grabbed", from: 1, to: 1 }
    const up = nextStepGrab(grabbed, 1, "up", 4).grab
    expect(up).toEqual({ kind: "grabbed", from: 1, to: 0 })
    expect(nextStepGrab(up, 1, "up", 4).grab).toEqual({ kind: "grabbed", from: 1, to: 0 })

    const last: StepGrab = { kind: "grabbed", from: 1, to: 3 }
    expect(nextStepGrab(last, 1, "down", 4).grab).toEqual(last)
  })

  it("Space で置くと、つかむ前の位置から置き場所への移動を返す", () => {
    const grabbed: StepGrab = { kind: "grabbed", from: 0, to: 2 }
    expect(nextStepGrab(grabbed, 0, "toggle", 4)).toEqual({
      grab: idle,
      outcome: { kind: "moved", from: 0, to: 2 },
    })
  })

  it("同じ位置で置くと、移動は返さない", () => {
    const grabbed: StepGrab = { kind: "grabbed", from: 2, to: 2 }
    expect(nextStepGrab(grabbed, 2, "toggle", 4)).toEqual({
      grab: idle,
      outcome: { kind: "placed", index: 2 },
    })
  })

  it("Esc でつかむ前へ戻し、移動は返さない", () => {
    const grabbed: StepGrab = { kind: "grabbed", from: 1, to: 3 }
    expect(nextStepGrab(grabbed, 1, "cancel", 4)).toEqual({
      grab: idle,
      outcome: { kind: "cancelled", index: 1 },
    })
  })

  it("並びが1つだけならつかまない", () => {
    expect(nextStepGrab(idle, 0, "toggle", 1)).toEqual({ grab: idle, outcome: { kind: "none" } })
  })
})
