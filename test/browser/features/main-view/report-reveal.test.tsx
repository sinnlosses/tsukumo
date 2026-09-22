import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, type RenderResult } from "@testing-library/react"
import { type ReactElement } from "react"

import { useReportReveal } from "../../../../src/browser/features/main-view/report-reveal.ts"

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

afterEach(() => {
  cleanup()
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
