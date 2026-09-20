import { describe, expect, it } from "bun:test"

import { planReveal } from "../../../../src/browser/features/main-view/reveal-plan.ts"

/** 文字1つぶんの持ち時間（`reveal-plan.ts` の `MS_PER_CHARACTER`）。 */
const MS_PER_CHARACTER = 10

/** 文字の塊1つぶんの上限（`reveal-plan.ts` の `MAX_TEXT_BLOCK_MS`）。 */
const MAX_TEXT_BLOCK_MS = 2000

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

describe("planReveal（塊の種類と時間の割り当て）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(planReveal(rootWith(""))).toEqual([])
  })

  it("塊1つぶんの時間は、その塊の文字数だけで決まる", () => {
    const blocks = planReveal(rootWith("<p>あい</p><p>うえおかきくけこ</p>"))

    expect(blocks.map((block) => block.kind)).toEqual(["text", "text"])
    expect(blocks[0]?.startMs).toBe(0)
    expect(blocks[0]?.endMs).toBe(2 * MS_PER_CHARACTER)
    expect(blocks[1]?.startMs).toBe(blocks[0]?.endMs)
    expect(blocks[1]?.endMs).toBe(10 * MS_PER_CHARACTER)
  })

  it("同じ塊は、後ろに何が続いても同じ時間で出る（全体の長さに引きずられない）", () => {
    const alone = planReveal(rootWith("<p>あい</p>"))
    const withTail = planReveal(rootWith(`<p>あい</p><p>${"う".repeat(500)}</p>`))

    expect(withTail[0]?.endMs).toBe(alone[0]?.endMs ?? -1)
  })

  it("極端に長い塊だけを上限で打ち切る", () => {
    const blocks = planReveal(rootWith(`<p>${"あ".repeat(500)}</p>`))

    // 500文字は素直に比例させると5秒。打ち切られるのはこの塊だけで、他の塊は速くならない。
    expect(blocks[0]?.endMs).toBe(MAX_TEXT_BLOCK_MS)
  })

  it("塊は隙間なく前から順に並ぶ", () => {
    const blocks = planReveal(rootWith("<p>あい</p><p>うえ</p><p>おか</p>"))

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
    )

    expect(blocks.map((block) => block.kind)).toEqual(["figure", "figure", "figure"])
  })

  it("文字を1つも持たない塊も塊ごと出す", () => {
    const blocks = planReveal(rootWith('<p><img src="/character/a.svg" /></p>'))

    expect(blocks.map((block) => block.kind)).toEqual(["figure"])
  })

  it("図のフェードは文字の塊より短く打ち切る", () => {
    const blocks = planReveal(rootWith('<div class="chart-block"><canvas></canvas></div>'))

    // 図は位置が動かないので、文字と同じ物差しで長く掛けるとただ遅いフェードに見える。
    expect(blocks[0]?.endMs).toBe(320)
  })

  it("文字の塊と図が混じっても、書く順（文書の順）のまま並ぶ", () => {
    const blocks = planReveal(
      rootWith('<p>まえがき</p><pre class="mermaid">flowchart TD</pre><p>あとがき</p>'),
    )

    expect(blocks.map((block) => block.kind)).toEqual(["text", "figure", "text"])
    expect(blocks.map((block) => block.element.tagName)).toEqual(["P", "PRE", "P"])
  })
})
