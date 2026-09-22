import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen, type RenderResult } from "@testing-library/react"
import { type ReactElement } from "react"

import { useReportReveal } from "../../../../src/browser/features/main-view/report-reveal.ts"
import {
  BRUSH_ORIGIN_ATTRIBUTE,
  publishBrushTip,
  useBrushTip,
} from "../../../../src/browser/stores/brush-tip.ts"

// 実際に見えている範囲（`clip-path` のポリゴン）はレイアウトの実測に乗るので、DOM だけの
// ここでは確かめない（`docs/architecture.md`「手で確かめること」。目視で確認する）。
// ここで守るのは**隠す・出し切る・止める**の配線だけ。

function Probe(props: { readonly reveal: boolean }): ReactElement {
  const rootRef = useReportReveal(props.reveal)

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
    ? `残っている:${String(tip.top)},${String(tip.bottom)}`
    : "書いている"
}

/**
 * jsdom はどの矩形も 0 で返すので、**筆先の居場所を見る回だけ**測れる値に差し替える。
 * 図の塊（`.chart-block`）は行ではなく box をそのまま1行として測られる
 * （`report-reveal.ts` の `lineBoxesOf`）ので、文字の行を作らなくても帯が1本できる。
 */
function measureBoxes(): () => void {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function boxOf(this: Element): DOMRect {
    if (this.classList.contains("chart-block")) {
      return new DOMRect(0, 100, 400, 200)
    }
    if (this.hasAttribute(BRUSH_ORIGIN_ATTRIBUTE)) {
      return new DOMRect(0, 50, 400, 600)
    }
    return original.call(this)
  }

  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

afterEach(() => {
  cleanup()
  publishBrushTip(undefined)
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

  it("打ち切っても、筆先は止まった場所ではなく本文の末尾に残る", () => {
    const restore = measureBoxes()
    try {
      render(
        <div data-brush-origin="">
          <Probe reveal />
          <BrushTipReadout />
        </div>,
      )

      fireEvent.keyDown(window)

      // 図の塊は 100〜300、原点は 50 から始まるので、末尾は入れ物の原点から 50〜250。
      // 打ち切った時点では筆は1フレームも進んでいない（止まった場所に残すなら何も出ない）。
      expect(screen.getByText("残っている:50,250")).toBeDefined()
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
