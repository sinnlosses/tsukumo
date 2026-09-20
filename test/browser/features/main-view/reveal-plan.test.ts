import { describe, expect, it } from "bun:test"

import { planReveal } from "../../../../src/browser/features/main-view/reveal-plan.ts"

const BUDGET_MS = 1400

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

describe("planReveal（塊の種類と時間の割り当て）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(planReveal(rootWith(""), BUDGET_MS)).toEqual([])
  })

  it("文字の塊は文字数の比で時間を分け、合計は持ち時間を超えない", () => {
    const blocks = planReveal(rootWith("<p>あい</p><p>うえおかきくけこ</p>"), BUDGET_MS)

    expect(blocks.map((block) => block.kind)).toEqual(["text", "text"])
    expect(blocks[0]?.startMs).toBe(0)
    // 2文字 : 8文字 なので 1:4。
    expect(Math.round(blocks[0]?.endMs ?? 0)).toBe(280)
    expect(blocks[1]?.startMs).toBe(blocks[0]?.endMs)
    expect(blocks.at(-1)?.endMs).toBeLessThanOrEqual(BUDGET_MS)
  })

  it("塊は隙間なく前から順に並ぶ", () => {
    const blocks = planReveal(rootWith("<p>あい</p><p>うえ</p><p>おか</p>"), BUDGET_MS)

    expect(blocks.map((block) => block.startMs)).toEqual([
      0,
      blocks[0]?.endMs ?? -1,
      blocks[1]?.endMs ?? -1,
    ])
  })

  it("mermaid と Chart.js の入れ物は、中身が何であれ塊ごと出す側にする", () => {
    const blocks = planReveal(
      rootWith(
        '<pre class="mermaid">flowchart TD</pre>' +
          '<div class="chart-block"><canvas></canvas></div>' +
          '<div class="mermaid-broken"><pre><code>壊れた図</code></pre></div>',
      ),
      BUDGET_MS,
    )

    expect(blocks.map((block) => block.kind)).toEqual(["figure", "figure", "figure"])
  })

  it("文字を1つも持たない塊も塊ごと出す", () => {
    const blocks = planReveal(rootWith('<p><img src="/character/a.svg" /></p>'), BUDGET_MS)

    expect(blocks.map((block) => block.kind)).toEqual(["figure"])
  })

  it("図のフェードは上限で打ち切り、余った時間は後ろの塊が使う", () => {
    const blocks = planReveal(
      rootWith('<div class="chart-block"><canvas></canvas></div>'),
      BUDGET_MS,
    )

    // 図だけのレポートでも、持ち時間を独り占めして遅いフェードにはならない。
    expect(blocks[0]?.endMs).toBe(320)
  })

  it("文字の塊と図が混じっても、書く順（文書の順）のまま並ぶ", () => {
    const blocks = planReveal(
      rootWith('<p>まえがき</p><pre class="mermaid">flowchart TD</pre><p>あとがき</p>'),
      BUDGET_MS,
    )

    expect(blocks.map((block) => block.kind)).toEqual(["text", "figure", "text"])
    expect(blocks.map((block) => block.element.tagName)).toEqual(["P", "PRE", "P"])
  })
})
