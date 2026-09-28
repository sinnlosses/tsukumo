import { describe, expect, it } from "vitest"

import { revealTimingOf, type RevealTiming } from "../../../../src/browser/domain/reveal-speed.ts"
import {
  blockProgress,
  planReveal,
  type RevealBlock,
} from "../../../../src/browser/domain/reveal/plan.ts"

/** `standard` の物差し（`revealTimingOf`）。個々のテストはこれで固定する。 */
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

/** 節と節の境目の印（`SECTION_BREAK_MARKDOWN` と同じ class）。 */
const BREAK = '<div class="report-section-break"></div>'

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

/** 時間帯だけを見る塊（`blockProgress` は位置を見ない）。留めが無ければ第3引数は省く。 */
function blockBetween(
  startMs: number,
  endMs: number,
  pauses: readonly { readonly atMs: number; readonly durationMs: number }[] = [],
): RevealBlock {
  return {
    members: [{ element: document.createElement("p"), kind: "text" }],
    startMs,
    endMs,
    pauses,
  }
}

describe("planReveal（トピックへのまとめ方と時間の割り当て）", () => {
  it("塊が1つも無ければ何も返さない", () => {
    expect(planReveal(rootWith(""), STANDARD_TIMING)).toEqual([])
  })

  it("節の境目の印から次の印までを1つの塊にまとめる", () => {
    const root = rootWith(
      "<h3>はじめ</h3><p>あ</p><table><tbody><tr><td>い</td></tr></tbody></table>" +
        `${BREAK}<h3>つぎ</h3><p>う</p>`,
    )

    expect(tagsOf(root)).toEqual([
      ["H3", "P", "TABLE"],
      ["H3", "P"],
    ])
  })

  it("見出し・副見出し・水平線だけでは塊を分けない（節の境目の印だけが切れ目）", () => {
    expect(
      tagsOf(rootWith("<p>あ</p><hr /><h5>節の中の副見出し</h5><h3>他の見出し</h3><p>い</p>")),
    ).toEqual([["P", "HR", "H5", "H3", "P"]])
  })

  it("印より前の要素も、それだけで1つの塊になる", () => {
    expect(tagsOf(rootWith(`<p>まえがき</p>${BREAK}<h3>本題</h3><p>なかみ</p>`))).toEqual([
      ["P"],
      ["H3", "P"],
    ])
  })

  it("見出しの無い節どうしの境目にも印は入るので、見出しが無くても1つの塊になる", () => {
    expect(tagsOf(rootWith(`<p>あ</p>${BREAK}<p>い</p>`))).toEqual([["P"], ["P"]])
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
      rootWith(`${head}${BREAK}<h3>つぎ</h3><p>${"う".repeat(500)}</p>`),
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
    const blocks = planReveal(
      rootWith(`<h3>あ</h3>${BREAK}<h3>い</h3>${BREAK}<h3>う</h3>`),
      STANDARD_TIMING,
    )

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

describe("planReveal（留める位置の割り当て）", () => {
  it("note の注意・異常（印は report-pause-point）は塊の末尾に留めを持ち、留めた分だけ endMs が伸びる", () => {
    const blocks = planReveal(
      rootWith('<p>まえがき</p><div class="note note-warn report-pause-point">ちゅうい</div>'),
      STANDARD_TIMING,
    )

    // 文字の重みは8（4+4）で下限に張り付くので、内容の持ち時間は MIN_BLOCK_MS。留めは末尾（重みの合計と同じ位置）。
    expect(blocks[0]?.pauses).toEqual([{ atMs: MIN_BLOCK_MS, durationMs: 400 }])
    expect(blocks[0]?.endMs).toBe(MIN_BLOCK_MS + 400)
  })

  it("options の中の「採る」カード（印は report-pause-point）は、直下の子の文字数で位置を按分する", () => {
    const blocks = planReveal(
      rootWith(
        '<div class="options">' +
          '<div class="option option-reject">A</div>' +
          '<div class="option option-adopt report-pause-point">BB</div>' +
          '<div class="option">CCC</div>' +
          "</div>",
      ),
      STANDARD_TIMING,
    )

    // 直下の子の文字数は A=1・BB=2・CCC=3（合計6）。「採る」までの累計は1+2=3で、ちょうど半分の位置。
    expect(blocks[0]?.pauses).toEqual([{ atMs: MIN_BLOCK_MS / 2, durationMs: 400 }])
  })

  it("留める対象が無ければ留めも無い", () => {
    const blocks = planReveal(rootWith("<p>ただの段落</p>"), STANDARD_TIMING)

    expect(blocks[0]?.pauses).toEqual([])
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

describe("blockProgress（留めている間は足踏みする）", () => {
  // 書く時間の軸は1000ms（内容の持ち時間）で、500msの位置に400msの留めを持つ塊
  // （時間帯そのものは 1000 + 400 = 1400ms に伸びる）。
  const block = blockBetween(0, 1400, [{ atMs: 500, durationMs: 400 }])

  it("留めの位置と、留めている間は同じ進み具合のまま動かない", () => {
    const atPauseStart = blockProgress(block, 500)

    expect(blockProgress(block, 700)).toBeCloseTo(atPauseStart, 10)
    expect(blockProgress(block, 900)).toBeCloseTo(atPauseStart, 10)
  })

  it("留めを抜けたら、また先へ進む", () => {
    expect(blockProgress(block, 1400)).toBeGreaterThan(blockProgress(block, 900))
    expect(blockProgress(block, 1400)).toBe(1)
  })

  it("留めが無いのと比べて、留めた分だけ同じ経過時間での進みが遅れる", () => {
    const withoutPause = blockBetween(0, 1000)

    // 留めの前（400ms）はどちらも同じ書く時間の軸の上にいるので、進み具合も同じ。
    expect(blockProgress(block, 400)).toBeCloseTo(blockProgress(withoutPause, 400), 10)
    // 留めのあと（900ms経過）は、留めた塊のほうが書く時間の軸で見るとまだ500msぶんしか進んでいない。
    expect(blockProgress(block, 900)).toBeCloseTo(blockProgress(withoutPause, 500), 10)
  })
})
