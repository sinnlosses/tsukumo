import { afterEach, describe, expect, it } from "bun:test"

import { act, cleanup, render, screen } from "@testing-library/react"

import {
  publishBrushTip,
  restBrushTip,
  useBrushTip,
} from "../../../../src/browser/domain/reveal/brush-tip.ts"

function Probe(): string {
  const tip = useBrushTip()
  if (tip === undefined) {
    return "筆先なし"
  }
  // やり取りの番号も読む（筆先はそれを出したやり取りのものでしかない。`brush-tip.ts`）。
  const place = `${String(tip.turnId)}:${String(tip.x)},${String(tip.top)},${String(tip.bottom)}`
  return tip.phase === "writing" ? `${place},${tip.stroke}` : `${place},残っている`
}

afterEach(() => {
  cleanup()
  publishBrushTip(undefined)
})

describe("筆先（BrushTip）", () => {
  it("まだ一度も書かれていなければ undefined", () => {
    render(<Probe />)

    expect(screen.getByText("筆先なし")).toBeDefined()
  })

  it("配られた筆先が読める", () => {
    render(<Probe />)

    act(() => {
      publishBrushTip({ turnId: 3, phase: "writing", x: 120, top: 40, bottom: 60, stroke: "sweep" })
    })

    expect(screen.getByText("3:120,40,60,sweep")).toBeDefined()
  })

  it("書き終わると、最後に書いた位置に残る（消えない）", () => {
    render(<Probe />)
    act(() => {
      publishBrushTip({
        turnId: 3,
        phase: "writing",
        x: 120,
        top: 40,
        bottom: 60,
        stroke: "return",
      })
    })

    act(() => {
      restBrushTip()
    })

    expect(screen.getByText("3:120,40,60,残っている")).toBeDefined()
  })

  it("残っている筆先をもう一度残しても、そのまま", () => {
    render(<Probe />)
    act(() => {
      publishBrushTip({ turnId: 3, phase: "writing", x: 120, top: 40, bottom: 60, stroke: "sweep" })
    })

    act(() => {
      restBrushTip()
    })
    act(() => {
      restBrushTip()
    })

    expect(screen.getByText("3:120,40,60,残っている")).toBeDefined()
  })

  it("一度も書けなかった演出は、前に残した筆先を消さない", () => {
    render(<Probe />)
    act(() => {
      publishBrushTip({ turnId: 3, phase: "resting", x: 120, top: 40, bottom: 60 })
    })

    act(() => {
      restBrushTip()
    })

    expect(screen.getByText("3:120,40,60,残っている")).toBeDefined()
  })

  it("次に書き始めると、そちらへ移る", () => {
    render(<Probe />)
    act(() => {
      publishBrushTip({ turnId: 3, phase: "resting", x: 120, top: 40, bottom: 60 })
    })

    act(() => {
      publishBrushTip({ turnId: 3, phase: "writing", x: 8, top: 300, bottom: 320, stroke: "sweep" })
    })

    expect(screen.getByText("3:8,300,320,sweep")).toBeDefined()
  })
})
