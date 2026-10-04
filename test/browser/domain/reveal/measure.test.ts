import { describe, expect, it } from "vitest"

import { endLineOf } from "../../../../src/browser/domain/reveal/measure.ts"
import type { RevealBlock, RevealElement } from "../../../../src/browser/domain/reveal/plan.ts"

// 実際に見えている帯の位置は目視で確かめる（`docs/architecture/testing.md`「手で確かめること」）。
// ここで守るのは、図・グラフの塊で右端をどの box から取るかだけ。

/** 要素の `getBoundingClientRect()` を固定値に差し替える（happy-dom はレイアウトを持たない）。 */
function stubRect(element: Element, box: DOMRect): void {
  element.getBoundingClientRect = () => box
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return new DOMRect(left, top, right - left, bottom - top)
}

function figureBlock(element: RevealElement): RevealBlock {
  return { members: [{ element, kind: "figure" }], startMs: 0, endMs: 0, pauses: [] }
}

/** 座標の原点にする基準の要素。 */
function originBase(): Element {
  const base = document.createElement("div")
  stubRect(base, rect(0, 0, 0, 0))
  return base
}

describe("endLineOf（図・グラフの塊）", () => {
  it("入れ物の中の svg の右端を使う（入れ物は全幅のまま残ってもよい）", () => {
    const container = document.createElement("div")
    container.className = "mermaid"
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    container.append(svg)

    stubRect(container, rect(0, 0, 950, 200))
    stubRect(svg, rect(0, 10, 320, 190))

    expect(endLineOf(figureBlock(container), originBase())).toEqual({
      top: 10,
      bottom: 190,
      right: 320,
    })
  })

  it("入れ物の中の canvas の右端を使う（Chart.js）", () => {
    const container = document.createElement("div")
    container.className = "chart-block"
    const canvas = document.createElement("canvas")
    container.append(canvas)

    stubRect(container, rect(0, 0, 950, 260))
    stubRect(canvas, rect(0, 0, 480, 240))

    expect(endLineOf(figureBlock(container), originBase())).toEqual({
      top: 0,
      bottom: 240,
      right: 480,
    })
  })

  it("要素自身が svg / canvas なら、その box をそのまま使う", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    stubRect(svg, rect(0, 0, 400, 300))

    expect(endLineOf(figureBlock(svg), originBase())).toEqual({ top: 0, bottom: 300, right: 400 })
  })

  it("svg / canvas がまだ無ければ入れ物の box に落とす（描画前・mermaid-broken）", () => {
    const container = document.createElement("div")
    container.className = "mermaid-broken"
    container.innerHTML = "<pre><code>壊れた図</code></pre>"
    stubRect(container, rect(0, 0, 950, 40))

    expect(endLineOf(figureBlock(container), originBase())).toEqual({
      top: 0,
      bottom: 40,
      right: 950,
    })
  })

  it("img は対象外で、要素そのものの box をそのまま使う", () => {
    const img = document.createElement("img")
    stubRect(img, rect(0, 0, 120, 80))

    expect(endLineOf(figureBlock(img), originBase())).toEqual({ top: 0, bottom: 80, right: 120 })
  })

  it("高さが取れない塊は行を返さない", () => {
    const container = document.createElement("div")
    container.className = "mermaid"
    stubRect(container, rect(0, 0, 0, 0))

    expect(endLineOf(figureBlock(container), originBase())).toBeUndefined()
  })
})
