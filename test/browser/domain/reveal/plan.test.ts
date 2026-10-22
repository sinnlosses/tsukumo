import { describe, expect, it } from "vitest"

import { revealTimingOf, type RevealTiming } from "../../../../src/browser/domain/reveal-speed.ts"
import {
  blockProgress,
  isShortReport,
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

/** 節の欄の入れ物（`Report` が作る形）。 */
function section(id: number, html: string): string {
  return `<div data-report-region="section" data-report-section="${id}">${html}</div>`
}

/** 節でない欄の入れ物（`Report` が作る形）。 */
function region(kind: "head" | "retrospective" | "favor" | "markdown", html: string): string {
  return `<div data-report-region="${kind}">${html}</div>`
}

/** 節の欄を並べた本文。 */
function sections(htmls: readonly string[]): string {
  return htmls.map((html, index) => section(index, html)).join("")
}

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

  it("節の欄1つを1つの塊にまとめる", () => {
    const root = rootWith(
      sections([
        "<h3>はじめ</h3><p>あ</p><table><tbody><tr><td>い</td></tr></tbody></table>",
        "<h3>つぎ</h3><p>う</p>",
      ]),
    )

    expect(tagsOf(root)).toEqual([
      ["H3", "P", "TABLE"],
      ["H3", "P"],
    ])
  })

  it("見出し・副見出し・水平線だけでは塊を分けない（節の欄の入れ物だけが切れ目）", () => {
    expect(
      tagsOf(rootWith("<p>あ</p><hr /><h5>節の中の副見出し</h5><h3>他の見出し</h3><p>い</p>")),
    ).toEqual([["P", "HR", "H3", "P"]])
  })

  it("節の見出し（h4・h5）と図表の題は筆の対象に入れず、最初から見える", () => {
    const root = rootWith(
      '<h4>節</h4><p>あ</p><h5>副見出し</h5><p>い</p><div data-reveal-caption="">図 1</div>',
    )

    expect(tagsOf(root)).toEqual([["P", "P"]])
  })

  it("題つきの図表は包みを対象にせず、題の行を除いた本体だけを対象にする", () => {
    const root = rootWith(
      '<div class="captioned"><div data-reveal-caption="">表 1</div>' +
        "<table><tbody><tr><td>あ</td></tr></tbody></table></div>" +
        '<div class="captioned"><pre class="mermaid">flowchart TD</pre>' +
        '<div data-reveal-caption="">図 1</div></div>',
    )

    expect(tagsOf(root)).toEqual([["TABLE", "PRE"]])
  })

  it("余白の柱の包みは対象にせず中の塊を対象にし、柱は最初から見える（包みの中の題つきの図表にも降りる）", () => {
    const root = rootWith(
      '<div class="with-gutter"><p>あ</p><div data-reveal-gutter=""><aside>出典</aside></div></div>' +
        '<div class="with-gutter"><div class="captioned"><pre class="mermaid">flowchart TD</pre>' +
        '<div data-reveal-caption="">図 1</div></div>' +
        '<div data-reveal-gutter=""><aside>メモ</aside></div></div>',
    )

    expect(tagsOf(root)).toEqual([["P", "PRE"]])
  })

  it("演出の全体は10秒を超えない。上限をまたぐ塊はそこで書き切り、後ろの塊は上限の時刻に一度に出す", () => {
    const html = `<h4>節</h4><p>${"あ".repeat(100)}</p>`
    const root = rootWith(sections(Array.from({ length: 8 }, () => html)))
    const blocks = planReveal(root, STANDARD_TIMING)

    expect(Math.max(...blocks.map((block) => block.endMs))).toBe(10_000)
    expect(blocks.map((block) => [block.startMs, block.endMs])).toEqual([
      [0, 4000],
      [4000, 8000],
      [8000, 10_000],
      [10_000, 10_000],
      [10_000, 10_000],
      [10_000, 10_000],
      [10_000, 10_000],
      [10_000, 10_000],
    ])
  })

  it("最初の節の欄より前の、頭でない要素も、それだけで1つの塊になる", () => {
    expect(tagsOf(rootWith(`<p>まえがき</p>${section(0, "<h3>本題</h3><p>なかみ</p>")}`))).toEqual([
      ["P"],
      ["H3", "P"],
    ])
  })

  it("振り返りとお願いの欄は、最後の節の欄と同じ塊に入る", () => {
    const root = rootWith(
      sections(["<p>あ</p>", "<p>い</p>"]) +
        region("retrospective", "<div>振り返り</div>") +
        region("favor", '<div class="note">お願い</div>'),
    )

    expect(tagsOf(root)).toEqual([["P"], ["P", "DIV", "DIV"]])
  })

  it("節の欄を持たない本文（data-report-section の無い markdown の欄）は、全体で1つの塊になる", () => {
    const root = rootWith(region("markdown", "<h3>見出し</h3><p>あ</p><hr /><p>い</p>"))

    expect(tagsOf(root)).toEqual([["H3", "P", "HR", "P"]])
  })

  it("中身が見出しだけの節の欄は塊を作らない", () => {
    expect(tagsOf(rootWith(sections(["<h4>見出しだけ</h4>", "<p>あ</p>"])))).toEqual([["P"]])
  })

  // 持ち時間は timing の3つ（文字あたり・下限・上限）だけで決まる。`standard` とその半分の物差しの両方で見る。
  it.each([
    {
      name: "塊1つぶんの時間は、その塊の中の文字数の合計で決まる",
      html: `<h3>見出し</h3><p>${"あ".repeat(100)}</p>`,
      standardMs: (3 + 100) * MS_PER_CHARACTER,
    },
    {
      // 3文字を素直に比例させると 60ms で、2画のZ字が一瞬で終わって筆が飛んで見える。
      name: "短い塊でもZ字をゆっくり書き切れるだけの時間（下限）を渡す",
      html: "<h3>見出し</h3>",
      standardMs: MIN_BLOCK_MS,
    },
    {
      // 500文字は素直に比例させると10秒。打ち切られるのはこの塊だけで、他の塊は速くならない。
      name: "極端に長い塊だけを上限で打ち切る",
      html: `<p>${"あ".repeat(500)}</p>`,
      standardMs: MAX_BLOCK_MS,
    },
  ])("$name", ({ html, standardMs }) => {
    for (const scale of [1, 0.5]) {
      const blocks = planReveal(rootWith(html), timingOf(scale))

      expect(blocks[0]?.startMs).toBe(0)
      expect(blocks[0]?.endMs).toBe(standardMs * scale)
    }
  })

  it("同じ塊は、後ろに何が続いても同じ時間で出る（全体の長さに引きずられない）", () => {
    const head = `<h3>見出し</h3><p>${"あ".repeat(100)}</p>`
    const alone = planReveal(rootWith(head), STANDARD_TIMING)
    const withTail = planReveal(
      rootWith(sections([head, `<h3>つぎ</h3><p>${"う".repeat(500)}</p>`])),
      STANDARD_TIMING,
    )

    expect(withTail[0]?.endMs).toBe(alone[0]?.endMs ?? -1)
  })

  it("塊は隙間なく前から順に並ぶ", () => {
    const blocks = planReveal(
      rootWith(sections(["<h3>あ</h3>", "<h3>い</h3>", "<h3>う</h3>"])),
      STANDARD_TIMING,
    )

    expect(blocks.map((block) => block.startMs)).toEqual([
      0,
      blocks[0]?.endMs ?? -1,
      blocks[1]?.endMs ?? -1,
    ])
  })

  it.each([
    {
      name: "mermaid と Chart.js の入れ物は、中身が何であれ opacity で出す側にする",
      html:
        '<pre class="mermaid">flowchart TD</pre>' +
        '<div class="chart-block"><canvas></canvas></div>' +
        '<div class="mermaid-broken"><pre><code>壊れた図</code></pre></div>',
      kinds: [["figure", "figure", "figure"]],
    },
    {
      name: "文字を1つも持たない要素も opacity で出す",
      html: '<p><img src="/character/a.svg" /></p>',
      kinds: [["figure"]],
    },
  ])("$name", ({ html, kinds }) => {
    expect(kindsOf(rootWith(html))).toEqual(kinds)
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

const SHORT_REPORT_WEIGHT = 200

describe("planReveal（結論と検証結果は筆の対象に入れない）", () => {
  it("頭の欄の要素は塊に入らない", () => {
    const root = rootWith(region("head", "<p>結論</p>") + section(0, "<h4>節</h4><p>本文</p>"))

    expect(tagsOf(root)).toEqual([["P"]])
  })

  it("頭の欄だけで節の無い本文は、お願いだけが対象", () => {
    const root = rootWith(region("head", "<p>結論</p>") + region("favor", "<p>お願い</p>"))

    expect(
      planReveal(root, STANDARD_TIMING).map((block) =>
        block.members.map((member) => member.element.textContent),
      ),
    ).toEqual([["お願い"]])
  })

  it("欄の入れ物が無い本文は、全体が対象", () => {
    const root = rootWith("<p>前置き</p><p>続き</p>")

    expect(tagsOf(root)).toEqual([["P", "P"]])
  })
})

describe("isShortReport（短いレポートは演出しない）", () => {
  it("筆の対象の文字数が線に満たなければ短い", () => {
    expect(isShortReport(rootWith(`<p>${"あ".repeat(SHORT_REPORT_WEIGHT - 1)}</p>`))).toBe(true)
    expect(isShortReport(rootWith(`<p>${"あ".repeat(SHORT_REPORT_WEIGHT)}</p>`))).toBe(false)
  })

  it("結論は数えない", () => {
    const root = rootWith(
      region("head", `<p>${"あ".repeat(SHORT_REPORT_WEIGHT)}</p>`) + section(0, "<p>短い</p>"),
    )

    expect(isShortReport(root)).toBe(true)
  })

  it("欄の入れ物そのものは数えず、図は100字ぶんで数える", () => {
    const root = rootWith(sections(["<p>短い</p>", '<div class="mermaid"></div>']))

    expect(isShortReport(root)).toBe(true)
  })
})
