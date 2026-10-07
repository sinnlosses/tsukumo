import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  publishBrushTip,
  restBrushTip,
  subscribeBrushTip,
  useBrushStance,
} from "../../../../src/browser/domain/reveal/brush-tip.ts"

/** いまの筆先を文字にする。受け取りは呼んだその場で1回届くので、すぐ外す。 */
function readTip(): string {
  let text = "筆先なし"
  const stop = subscribeBrushTip((tip) => {
    if (tip === undefined) {
      return
    }
    // やり取りの番号も読む（筆先はそれを出したやり取りのものでしかない。`BrushTip`）。
    const place = `${String(tip.turnId)}:${String(tip.x)},${String(tip.top)},${String(tip.bottom)}`
    text = tip.phase === "writing" ? `${place},${tip.stroke}` : `${place},残っている`
  })
  stop()
  return text
}

/** 位置を除いた筆先（どのやり取りのどの画か）を描く。 */
function StanceProbe(): string {
  const stance = useBrushStance()
  return stance === undefined ? "筆先なし" : `${String(stance.turnId)}:${stance.motion}`
}

afterEach(() => {
  cleanup()
  publishBrushTip(undefined)
})

describe("筆先（BrushTip）", () => {
  it("まだ一度も書かれていなければ undefined", () => {
    expect(readTip()).toBe("筆先なし")
  })

  it("配られた筆先が読める", () => {
    publishBrushTip({ turnId: 3, phase: "writing", x: 120, top: 40, bottom: 60, stroke: "sweep" })

    expect(readTip()).toBe("3:120,40,60,sweep")
  })

  it("書き終わると、最後に書いた位置に残る（消えない）", () => {
    publishBrushTip({ turnId: 3, phase: "writing", x: 120, top: 40, bottom: 60, stroke: "return" })

    restBrushTip()

    expect(readTip()).toBe("3:120,40,60,残っている")
  })

  it("一度も書けなかった演出は、前に残した筆先を消さない", () => {
    publishBrushTip({ turnId: 3, phase: "resting", x: 120, top: 40, bottom: 60 })

    restBrushTip()

    expect(readTip()).toBe("3:120,40,60,残っている")
  })

  it("次に書き始めると、そちらへ移る", () => {
    publishBrushTip({ turnId: 3, phase: "resting", x: 120, top: 40, bottom: 60 })

    publishBrushTip({ turnId: 3, phase: "writing", x: 8, top: 300, bottom: 320, stroke: "sweep" })

    expect(readTip()).toBe("3:8,300,320,sweep")
  })
})

describe("useBrushStance（位置を除いた筆先）", () => {
  it("どのやり取りのどの画かが読め、書き終わると resting になる", () => {
    render(<StanceProbe />)

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
    expect(screen.getByText("3:return")).toBeDefined()

    act(() => {
      restBrushTip()
    })
    expect(screen.getByText("3:resting")).toBeDefined()
  })
})
