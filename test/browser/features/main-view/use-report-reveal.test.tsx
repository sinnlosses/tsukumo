import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"
import { type ReactElement } from "react"

import { saveRevealSpeed } from "../../../../src/browser/domain/reveal-speed.ts"
import { useReportReveal } from "../../../../src/browser/features/main-view/hooks/use-report-reveal.ts"
import {
  BRUSH_ORIGIN_ATTRIBUTE,
  publishBrushTip,
  useBrushTip,
} from "../../../../src/browser/stores/brush-tip.ts"

const REVEAL_SPEED_STORAGE_KEY = "tsukumo-reveal-speed:v1"

// 実際に見えている範囲（`clip-path` のポリゴン）はレイアウトの実測に乗るので、DOM だけの
// ここでは確かめない（`docs/architecture.md`「手で確かめること」。目視で確認する）。
// ここで守るのは**隠す・出し切る・止める**の配線だけ。

/** 演出を掛ける相手のやり取り（配る筆先に添う番号。`stores/brush-tip.ts`）。 */
const TURN_ID = 4

function Probe(props: { readonly reveal: boolean }): ReactElement {
  const rootRef = useReportReveal(props.reveal, TURN_ID)

  return (
    <div data-testid="root" ref={rootRef}>
      <p>架空の本文</p>
      <div className="chart-block">
        <canvas />
      </div>
    </div>
  )
}

function renderProbe(reveal: boolean): RenderResult {
  return render(<Probe reveal={reveal} />)
}

function root(): HTMLElement {
  const node = document.querySelector("[data-testid='root']")
  if (!(node instanceof HTMLElement)) {
    throw new Error("根が見つからない")
  }
  return node
}

function paragraph(): HTMLElement {
  const node = root().querySelector("p")
  if (!(node instanceof HTMLElement)) {
    throw new Error("段落が見つからない")
  }
  return node
}

function figure(): HTMLElement {
  const node = root().querySelector(".chart-block")
  if (!(node instanceof HTMLElement)) {
    throw new Error("図の塊が見つからない")
  }
  return node
}

/** 残った筆先の居場所。読めるようにするためだけの表示で、書いている最中は区別だけ見る。 */
function BrushTipReadout(): string {
  const tip = useBrushTip()
  if (tip === undefined) {
    return "筆先なし"
  }
  return tip.phase === "resting"
    ? `残っている:${String(tip.turnId)}:${String(tip.x)},${String(tip.top)},${String(tip.bottom)}`
    : "書いている"
}

/**
 * 行に見立てた矩形（`left, top, width, height`）。**最後だけ短い**——書き終わりの筆先を
 * 「帯の右端（いちばん長い行の右）」に置くと、ここで 400 に飛ぶ。
 */
const LINE_BOXES = [
  [0, 100, 400, 40],
  [0, 140, 400, 40],
  [0, 180, 400, 40],
  [0, 220, 150, 40],
] as const

/** 本文の入れ物の矩形。筆先の座標はここの左上が原点になる。 */
const ORIGIN_BOX = [0, 50, 400, 600] as const

/**
 * happy-dom はレイアウトを持たない（どの矩形も 0）ので、**筆先の居場所を見る回だけ**測れる値に
 * 差し替える。図の塊（`.chart-block`）は行ではなく box をそのまま1行として測られる
 * （`reveal-measure.ts` の `lineBoxesOf`）ので、**文字の行を作らずに行を並べられる**。
 */
function measureBoxes(): () => void {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function boxOf(this: Element): DOMRect {
    const line = LINE_BOXES[Number(this.getAttribute("data-line") ?? "-1")]
    if (line !== undefined) {
      return new DOMRect(...line)
    }
    if (this.hasAttribute(BRUSH_ORIGIN_ATTRIBUTE)) {
      return new DOMRect(...ORIGIN_BOX)
    }
    return original.call(this)
  }

  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

/** 行に見立てた図を並べた本文（`measureBoxes` が矩形を名乗る）。 */
function LinesProbe(): ReactElement {
  const rootRef = useReportReveal(true, TURN_ID)

  return (
    <div ref={rootRef}>
      {LINE_BOXES.map((_line, index) => (
        <div className="chart-block" data-line={index} key={index}>
          <canvas />
        </div>
      ))}
    </div>
  )
}

afterEach(() => {
  cleanup()
  publishBrushTip(undefined)
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
})

describe("useReportReveal（見せる範囲を進める配線）", () => {
  it("演出の相手でなければ、何も隠さない", () => {
    renderProbe(false)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(paragraph().style.clipPath).toBe("")
    expect(figure().style.opacity).toBe("")
  })

  it("演出の相手なら、描画したその場で塊を隠す（文字は clip-path、図は opacity）", () => {
    renderProbe(true)

    expect(root().getAttribute("data-revealing")).toBe("yes")
    expect(paragraph().style.clipPath).toBe("inset(0 0 100% 0)")
    expect(figure().style.opacity).toBe("0")
  })

  it("キー入力で即座に全部出す", () => {
    renderProbe(true)

    fireEvent.keyDown(window)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(paragraph().style.clipPath).toBe("")
    expect(figure().style.opacity).toBe("")
  })

  it("クリック（ポインタを下ろした時点）で即座に全部出す", () => {
    renderProbe(true)

    fireEvent(window, new Event("pointerdown"))

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(paragraph().style.clipPath).toBe("")
  })

  it("打ち切っても、筆先は止まった場所ではなく最後の行の終わりに残る", () => {
    const restore = measureBoxes()
    try {
      render(
        <div data-brush-origin="">
          <LinesProbe />
          <BrushTipReadout />
        </div>,
      )

      fireEvent.keyDown(window)

      // 最後の行は 220〜260 の右 150。原点が 50 から始まるので、入れ物基準で 150,170,210。
      // 打ち切った時点では筆は1フレームも進んでいないので、止まった場所に残すなら何も出ない。
      // 帯の右端に残すなら、**最後の行より長い行に引かれて** x が 400 になる。
      expect(screen.getByText("残っている:4:150,170,210")).toBeDefined()
    } finally {
      restore()
    }
  })

  it("スクロール（ホイール・指）では打ち切らない", () => {
    renderProbe(true)

    fireEvent(window, new Event("wheel"))
    fireEvent(window, new Event("touchmove"))

    expect(root().getAttribute("data-revealing")).toBe("yes")
    expect(paragraph().style.clipPath).toBe("inset(0 0 100% 0)")
  })

  it("部品が外れたら、隠したままにしない", () => {
    const { unmount } = renderProbe(true)
    const hidden = paragraph()

    unmount()

    expect(hidden.style.clipPath).toBe("")
  })
})

describe("useReportReveal（書き上げる演出の速さが「切る」のとき）", () => {
  it("演出の相手でも、マウント時点で「切る」が保存されていれば何も隠さない", () => {
    saveRevealSpeed("off")

    renderProbe(true)

    expect(root().hasAttribute("data-revealing")).toBe(false)
    expect(paragraph().style.clipPath).toBe("")
    expect(figure().style.opacity).toBe("")
  })

  it("「切る」のときは筆先も配らない", () => {
    saveRevealSpeed("off")

    render(
      <div data-brush-origin="">
        <Probe reveal={true} />
        <BrushTipReadout />
      </div>,
    )

    expect(screen.getByText("筆先なし")).toBeDefined()
  })
})
