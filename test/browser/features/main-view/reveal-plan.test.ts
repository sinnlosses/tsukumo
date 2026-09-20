import { describe, expect, it } from "bun:test"

import { planReveal } from "../../../../src/browser/features/main-view/reveal-plan.ts"

/** 文字1つぶんの持ち時間（`reveal-plan.ts` の `MS_PER_CHARACTER`）。 */
const MS_PER_CHARACTER = 40

/** トピック1つぶんの下限と上限（`reveal-plan.ts` の `MIN_BLOCK_MS` / `MAX_BLOCK_MS`）。 */
const MIN_BLOCK_MS = 2400
const MAX_BLOCK_MS = 8000

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

function kindsOf(root: HTMLElement): readonly (readonly string[])[] {
  return planReveal(root).map((block) => block.members.map((member) => member.kind))
}

function tagsOf(root: HTMLElement): readonly (readonly string[])[] {
  return planReveal(root).map((block) => block.members.map((member) => member.element.tagName))
}

describe("planReveal（トピックへのまとめ方と時間の割り当て）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(planReveal(rootWith(""))).toEqual([])
  })

  it("見出しから次の見出しまでを1つの塊にまとめる", () => {
    const root = rootWith(
      "<h3>はじめ</h3><p>あ</p><table><tbody><tr><td>い</td></tr></tbody></table>" +
        "<h3>つぎ</h3><p>う</p>",
    )

    expect(tagsOf(root)).toEqual([
      ["H3", "P", "TABLE"],
      ["H3", "P"],
    ])
  })

  it("水平線も塊の切れ目にする", () => {
    expect(tagsOf(rootWith("<p>あ</p><hr /><p>い</p>"))).toEqual([["P"], ["HR", "P"]])
  })

  it("見出しより前の要素も、それだけで1つの塊になる", () => {
    expect(tagsOf(rootWith("<p>まえがき</p><h3>本題</h3><p>なかみ</p>"))).toEqual([
      ["P"],
      ["H3", "P"],
    ])
  })

  it("塊1つぶんの時間は、その塊の中の文字数の合計で決まる", () => {
    const body = "あ".repeat(100)
    const blocks = planReveal(rootWith(`<h3>見出し</h3><p>${body}</p>`))

    expect(blocks[0]?.startMs).toBe(0)
    expect(blocks[0]?.endMs).toBe((3 + 100) * MS_PER_CHARACTER)
  })

  it("短い塊でもZ字をゆっくり書き切れるだけの時間を渡す", () => {
    const blocks = planReveal(rootWith("<h3>見出し</h3>"))

    // 3文字を素直に比例させると 60ms で、2画のZ字が一瞬で終わって筆が飛んで見える。
    expect(blocks[0]?.endMs).toBe(MIN_BLOCK_MS)
  })

  it("同じ塊は、後ろに何が続いても同じ時間で出る（全体の長さに引きずられない）", () => {
    const head = `<h3>見出し</h3><p>${"あ".repeat(100)}</p>`
    const alone = planReveal(rootWith(head))
    const withTail = planReveal(rootWith(`${head}<h3>つぎ</h3><p>${"う".repeat(500)}</p>`))

    expect(withTail[0]?.endMs).toBe(alone[0]?.endMs ?? -1)
  })

  it("極端に長い塊だけを上限で打ち切る", () => {
    const blocks = planReveal(rootWith(`<p>${"あ".repeat(500)}</p>`))

    // 500文字は素直に比例させると10秒。打ち切られるのはこの塊だけで、他の塊は速くならない。
    expect(blocks[0]?.endMs).toBe(MAX_BLOCK_MS)
  })

  it("塊は隙間なく前から順に並ぶ", () => {
    const blocks = planReveal(rootWith("<h3>あ</h3><h3>い</h3><h3>う</h3>"))

    expect(blocks.map((block) => block.startMs)).toEqual([
      0,
      blocks[0]?.endMs ?? -1,
      blocks[1]?.endMs ?? -1,
    ])
  })

  it("mermaid と Chart.js の入れ物は、中身が何であれ opacity で出す側にする", () => {
    const root = rootWith(
      '<pre class="mermaid">flowchart TD</pre>' +
        '<div class="chart-block"><canvas></canvas></div>' +
        '<div class="mermaid-broken"><pre><code>壊れた図</code></pre></div>',
    )

    expect(kindsOf(root)).toEqual([["figure", "figure", "figure"]])
  })

  it("文字を1つも持たない要素も opacity で出す", () => {
    expect(kindsOf(rootWith('<p><img src="/character/a.svg" /></p>'))).toEqual([["figure"]])
  })

  it("図は文字数を持たないので、段落1つぶんの重みで数える", () => {
    const blocks = planReveal(rootWith('<div class="chart-block"><canvas></canvas></div>'))

    expect(blocks[0]?.endMs).toBe(100 * MS_PER_CHARACTER)
  })

  it("文字と図が混じっても、書く順（文書の順）のまま並ぶ", () => {
    const root = rootWith(
      '<h3>見出し</h3><p>まえがき</p><pre class="mermaid">flowchart TD</pre><p>あとがき</p>',
    )

    expect(kindsOf(root)).toEqual([["text", "text", "figure", "text"]])
    expect(tagsOf(root)).toEqual([["H3", "P", "PRE", "P"]])
  })
})
