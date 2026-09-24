import { describe, expect, it } from "bun:test"

import { revealTimingOf, type RevealTiming } from "../../../../src/browser/domain/reveal-speed.ts"
import {
  blockProgress,
  planReveal,
  type RevealBlock,
} from "../../../../src/browser/domain/reveal/plan.ts"

/** `standard` の物差し（`domain/reveal-speed.ts`）。個々のテストはこれで固定する。 */
const STANDARD_TIMING = revealTimingOf("standard")

/** テストだけで使う物差し。`standard` からの倍率で組み立て、値の意味は名前で示す。 */
function timingOf(scale: number): RevealTiming {
  return {
    msPerCharacter: STANDARD_TIMING.msPerCharacter * scale,
    minBlockMs: STANDARD_TIMING.minBlockMs * scale,
    maxBlockMs: STANDARD_TIMING.maxBlockMs * scale,
  }
}

/** 文字1つぶんの持ち時間（`standard` の物差し）。 */
const MS_PER_CHARACTER = STANDARD_TIMING.msPerCharacter

/** トピック1つぶんの下限と上限（`standard` の物差し）。 */
const MIN_BLOCK_MS = STANDARD_TIMING.minBlockMs
const MAX_BLOCK_MS = STANDARD_TIMING.maxBlockMs

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div")
  root.innerHTML = html
  return root
}

function kindsOf(root: HTMLElement): readonly (readonly string[])[] {
  return planReveal(root, STANDARD_TIMING).map((block) =>
    block.members.map((member) => member.kind),
  )
}

function tagsOf(root: HTMLElement): readonly (readonly string[])[] {
  return planReveal(root, STANDARD_TIMING).map((block) =>
    block.members.map((member) => member.element.tagName),
  )
}

/** 時間帯だけを見る塊（`blockProgress` は位置を見ない）。 */
function blockBetween(startMs: number, endMs: number): RevealBlock {
  return {
    members: [{ element: document.createElement("p"), kind: "text" }],
    startMs,
    endMs,
  }
}

describe("planReveal（トピックへのまとめ方と時間の割り当て）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(planReveal(rootWith(""), STANDARD_TIMING)).toEqual([])
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
    const blocks = planReveal(rootWith(`<h3>見出し</h3><p>${body}</p>`), STANDARD_TIMING)

    expect(blocks[0]?.startMs).toBe(0)
    expect(blocks[0]?.endMs).toBe((3 + 100) * MS_PER_CHARACTER)
  })

  it("短い塊でもZ字をゆっくり書き切れるだけの時間を渡す", () => {
    const blocks = planReveal(rootWith("<h3>見出し</h3>"), STANDARD_TIMING)

    // 3文字を素直に比例させると 60ms で、2画のZ字が一瞬で終わって筆が飛んで見える。
    expect(blocks[0]?.endMs).toBe(MIN_BLOCK_MS)
  })

  it("同じ塊は、後ろに何が続いても同じ時間で出る（全体の長さに引きずられない）", () => {
    const head = `<h3>見出し</h3><p>${"あ".repeat(100)}</p>`
    const alone = planReveal(rootWith(head), STANDARD_TIMING)
    const withTail = planReveal(
      rootWith(`${head}<h3>つぎ</h3><p>${"う".repeat(500)}</p>`),
      STANDARD_TIMING,
    )

    expect(withTail[0]?.endMs).toBe(alone[0]?.endMs ?? -1)
  })

  it("極端に長い塊だけを上限で打ち切る", () => {
    const blocks = planReveal(rootWith(`<p>${"あ".repeat(500)}</p>`), STANDARD_TIMING)

    // 500文字は素直に比例させると10秒。打ち切られるのはこの塊だけで、他の塊は速くならない。
    expect(blocks[0]?.endMs).toBe(MAX_BLOCK_MS)
  })

  it("塊は隙間なく前から順に並ぶ", () => {
    const blocks = planReveal(rootWith("<h3>あ</h3><h3>い</h3><h3>う</h3>"), STANDARD_TIMING)

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
    const blocks = planReveal(
      rootWith('<div class="chart-block"><canvas></canvas></div>'),
      STANDARD_TIMING,
    )

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

describe("planReveal（物差し=timing を変えると速さが変わる）", () => {
  it("文字1つあたりの時間は timing の msPerCharacter で決まる", () => {
    const body = "あ".repeat(100)
    const html = `<h3>見出し</h3><p>${body}</p>`
    const half = planReveal(rootWith(html), timingOf(0.5))

    // `standard` の半分の物差しなら、同じ本文でも塊の持ち時間が半分になる。
    expect(half[0]?.endMs).toBe(((3 + 100) * MS_PER_CHARACTER) / 2)
  })

  it("塊の上限も timing の maxBlockMs で決まる", () => {
    const html = `<p>${"あ".repeat(500)}</p>`
    const half = planReveal(rootWith(html), timingOf(0.5))

    expect(half[0]?.endMs).toBe(MAX_BLOCK_MS / 2)
  })

  it("塊の下限も timing の minBlockMs で決まる", () => {
    const half = planReveal(rootWith("<h3>見出し</h3>"), timingOf(0.5))

    expect(half[0]?.endMs).toBe(MIN_BLOCK_MS / 2)
  })
})

describe("blockProgress（塊の中の進み方）", () => {
  /** 位置は見ないので、塊は時間帯だけで区別する。 */
  const block = blockBetween(0, 1000)

  it("始まりと終わりは端に付ける", () => {
    expect(blockProgress(block, 0)).toBe(0)
    expect(blockProgress(block, 1000)).toBe(1)
  })

  it("時間帯の外へ出ても端で止まる", () => {
    expect(blockProgress(block, -500)).toBe(0)
    expect(blockProgress(block, 5000)).toBe(1)
  })

  it("真ん中では半分まで進む（緩急は前後で対称）", () => {
    expect(blockProgress(block, 500)).toBeCloseTo(0.5, 10)
    expect(blockProgress(block, 250) + blockProgress(block, 750)).toBeCloseTo(1, 10)
  })

  it("書き始めと書き終わりは等速より遅く、途中は速い", () => {
    // 最初の 1/4 の時間で進むのは 1/4 未満、真ん中の 1/2 の時間で半分以上を進む。
    expect(blockProgress(block, 250)).toBeLessThan(0.25)
    expect(blockProgress(block, 750) - blockProgress(block, 250)).toBeGreaterThan(0.5)
  })

  it("時間帯の幅が無い塊は、出し切ったものとして扱う", () => {
    const instant = blockBetween(400, 400)

    expect(blockProgress(instant, 400)).toBe(1)
  })
})
