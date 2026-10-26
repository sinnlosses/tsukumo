import { describe, expect, it } from "vitest"

import { phaseTimesMarkdown } from "../../../src/shared/report/report-phase-time.ts"

const at = (milliseconds: number) => ({ kind: "known", milliseconds }) as const

const UNKNOWN = { kind: "unknown" } as const

const known = (label: string, milliseconds: number, start = 0) => ({
  kind: "phase" as const,
  label,
  start: at(start),
  duration: at(milliseconds),
})

const unknown = (label: string) => ({
  kind: "phase" as const,
  label,
  start: UNKNOWN,
  duration: UNKNOWN,
})

const parallelRows = () =>
  ({
    kind: "parallel",
    label: "並列 2–3",
    start: at(5_000),
    wall: at(20_000),
    phases: [
      { label: "2/3 架空の段B", start: at(5_000), duration: at(10_000) },
      { label: "3/3 架空の段C", start: UNKNOWN, duration: UNKNOWN },
    ],
  }) as const

const wrap = (total: string, chart: string, rows: string): string =>
  `<div class="phase-times"><div class="phase-times-head"><span class="phase-times-heading">段ごとの時間</span><span class="phase-times-total">計 ${total}</span></div>${chart}<div role="table" aria-label="段ごとの所要時間">${rows}</div></div>`

const band = (...segments: readonly string[]): string =>
  `<div class="phase-band" aria-hidden="true">${segments.join("")}</div>`
const segment = (title: string, milliseconds: number, longest = false): string =>
  `<span class="phase-band-segment${longest ? " phase-band-longest" : ""}" title="${title}" style="flex: ${String(milliseconds)} 0 0"></span>`
const unknownSegment = (title: string): string =>
  `<span class="phase-band-unknown" title="${title}"></span>`

const row = (num: string, name: string, value: string, ratio: string, classes = ""): string =>
  `<div class="phase-time${classes}" role="row"><span class="phase-time-mark"></span><span class="phase-time-label"><span class="phase-time-num">${num}</span>${name}</span><span class="phase-time-value">${value}</span><span class="phase-time-ratio">${ratio}</span></div>`

const waterfallBar = (title: string, left: string, width: string, classes = ""): string =>
  `<div class="phase-waterfall-row"><span class="phase-waterfall-bar${classes}" title="${title}" style="margin-left: ${left}; width: ${width}"></span></div>`

describe("phaseTimesMarkdown", () => {
  it("段が無ければ空文字", () => {
    expect(phaseTimesMarkdown([])).toBe("")
  })

  it("見出しの行に、測れた区間の和を「計」として書き、測れない段は帯の末尾の不明の区間と不明の行にする", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 20_000),
      known("2/3 架空の段B", 40_000),
      unknown("3/3 架空の段C"),
    ])

    expect(html).toBe(
      wrap(
        "1分00秒",
        band(
          segment("1/3 架空の段A 20秒", 20_000),
          segment("2/3 架空の段B 40秒", 40_000, true),
          unknownSegment("3/3 架空の段C 不明"),
        ),
        row("1/3", "架空の段A", "20秒", "33%") +
          row("2/3", "架空の段B", "40秒", "67%", " phase-time-longest") +
          row("3/3", "架空の段C", "不明", "", " phase-time-unknown"),
      ),
    )
  })

  it("帯の区間の長さは時間（ミリ秒）の比で、title に名前と時間を持つ", () => {
    const html = phaseTimesMarkdown([
      known("1/2 架空の段A", 20_000),
      known("2/2 架空の段B", 10_000),
    ])

    expect(html).toBe(
      wrap(
        "30秒",
        band(segment("1/2 架空の段A 20秒", 20_000, true), segment("2/2 架空の段B 10秒", 10_000)),
        row("1/2", "架空の段A", "20秒", "67%", " phase-time-longest") +
          row("2/2", "架空の段B", "10秒", "33%"),
      ),
    )
  })

  it("割合は時間÷計を整数%に丸める", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 1_000),
      known("2/3 架空の段B", 1_000),
      known("3/3 架空の段C", 1_000),
    ])

    expect(html.match(/<span class="phase-time-ratio">33%<\/span>/g)).toHaveLength(3)
  })

  it("一本道で測れた回は waterfall を使わず1本の帯のままで、一番長い区間の帯と行にだけ目印を付ける", () => {
    const html = phaseTimesMarkdown([known("1/2 架空の段A", 5_000), known("2/2 架空の段B", 9_000)])

    expect(html).toBe(
      wrap(
        "14秒",
        band(segment("1/2 架空の段A 5秒", 5_000), segment("2/2 架空の段B 9秒", 9_000, true)),
        row("1/2", "架空の段A", "5秒", "36%") +
          row("2/2", "架空の段B", "9秒", "64%", " phase-time-longest"),
      ),
    )
  })

  it("並列の段が無く測れない段のある回は1本の帯のままで、測れない段を固定幅の斜線の区間にする", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 5_000),
      unknown("2/3 架空の段B"),
      known("3/3 架空の段C", 5_000),
    ])

    expect(html).toBe(
      wrap(
        "10秒",
        band(
          segment("1/3 架空の段A 5秒", 5_000, true),
          unknownSegment("2/3 架空の段B 不明"),
          segment("3/3 架空の段C 5秒", 5_000),
        ),
        row("1/3", "架空の段A", "5秒", "50%", " phase-time-longest") +
          row("2/3", "架空の段B", "不明", "", " phase-time-unknown") +
          row("3/3", "架空の段C", "5秒", "50%"),
      ),
    )
  })

  it("すべて測れなくても壊れず、帯のまま計は0秒で目印は付かない", () => {
    const html = phaseTimesMarkdown([unknown("1/1 架空の段")])

    expect(html).toBe(
      wrap(
        "0秒",
        band(unknownSegment("1/1 架空の段 不明")),
        row("1/1", "架空の段", "不明", "", " phase-time-unknown"),
      ),
    )
  })

  it("並列の段のある回で測れない段が混じれば、waterfall のまま斜線の欠片を直前の棒の終わりに置き、一覧は並列の段の行と字下げする中の段の行を1つの包みに入れる", () => {
    const html = phaseTimesMarkdown([known("1/3 架空の段A", 5_000), parallelRows()])

    expect(html).toBe(
      wrap(
        "25秒",
        '<div class="phase-waterfall" aria-hidden="true">' +
          waterfallBar("1/3 架空の段A 5秒", "0%", "20%") +
          '<div class="phase-waterfall-group"><span class="phase-time-wall phase-time-wall-longest" title="並列 2–3 20秒" style="margin-left: 20%; width: 80%"></span>' +
          waterfallBar("2/3 架空の段B 10秒", "20%", "40%") +
          waterfallBar("3/3 架空の段C 不明", "98%", "2%", " phase-waterfall-unknown") +
          "</div></div>",
        row("1/3", "架空の段A", "5秒", "20%") +
          '<div class="phase-time-group" role="rowgroup">' +
          '<div class="phase-time phase-time-longest" role="row"><span class="phase-time-mark"></span><span class="phase-time-label">並列 2–3</span><span class="phase-time-value">20秒</span><span class="phase-time-ratio">80%</span></div>' +
          '<div class="phase-time phase-time-inner" role="row"><span class="phase-time-label"><span class="phase-time-num">2/3</span>架空の段B</span><span class="phase-time-value">10秒</span><span class="phase-time-ratio"></span></div>' +
          '<div class="phase-time phase-time-inner phase-time-unknown" role="row"><span class="phase-time-label"><span class="phase-time-num">3/3</span>架空の段C</span><span class="phase-time-value">不明</span><span class="phase-time-ratio"></span></div>' +
          "</div>",
      ),
    )
  })

  it("並列の回は waterfall で、親の棒を描かず、中の段の棒の数だけ棒を置き、囲みが壁時計の開始と長さを持つ", () => {
    const html = phaseTimesMarkdown([
      known("1/4 架空の段A", 10_000),
      {
        kind: "parallel",
        label: "並列 2–3",
        start: at(10_000),
        wall: at(10_000),
        phases: [
          { label: "2/4 架空の段B", start: at(10_000), duration: at(10_000) },
          { label: "3/4 架空の段C", start: at(10_000), duration: at(6_000) },
        ],
      },
      known("4/4 架空の段D", 5_000, 20_000),
    ])

    const bars = [
      ...html.matchAll(
        /<span class="phase-waterfall-bar(?: phase-waterfall-longest)?" title="([^"]+)" style="margin-left: ([\d.]+)%; width: ([\d.]+)%">/g,
      ),
    ]
    expect(bars.map(([, title, left, width]) => [title, left, width])).toEqual([
      ["1/4 架空の段A 10秒", "0", "40"],
      ["2/4 架空の段B 10秒", "40", "40"],
      ["3/4 架空の段C 6秒", "40", "24"],
      ["4/4 架空の段D 5秒", "80", "20"],
    ])
    const walls = [
      ...html.matchAll(
        /<span class="phase-time-wall" title="([^"]+)" style="margin-left: ([\d.]+)%; width: ([\d.]+)%"><\/span>/g,
      ),
    ]
    expect(walls.map(([, title, left, width]) => [title, left, width])).toEqual([
      ["並列 2–3 10秒", "40", "40"],
    ])
    expect(html.match(/<div class="phase-waterfall-group">/g)).toHaveLength(1)
    expect(html.match(/phase-waterfall-longest/g)).toHaveLength(1)
    expect(html.match(/phase-time-wall-longest/g)).toBeNull()
    expect(html.match(/<span class="phase-waterfall-bar/g)).toHaveLength(4)
    expect(html.match(/<span class="phase-times-total">計 25秒<\/span>/g)).toHaveLength(1)
  })

  it("並列の段の壁時計が測れなければ、囲みは描かず中の段の棒だけを置く", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 5_000),
      {
        kind: "parallel",
        label: "並列 2–3",
        start: UNKNOWN,
        wall: UNKNOWN,
        phases: [{ label: "2/3 架空の段B", start: at(5_000), duration: at(10_000) }],
      },
    ])

    expect(html).toBe(
      wrap(
        "5秒",
        '<div class="phase-waterfall" aria-hidden="true">' +
          waterfallBar("1/3 架空の段A 5秒", "0%", "33.33%", " phase-waterfall-longest") +
          '<div class="phase-waterfall-group">' +
          waterfallBar("2/3 架空の段B 10秒", "33.33%", "66.67%") +
          "</div></div>",
        row("1/3", "架空の段A", "5秒", "100%", " phase-time-longest") +
          '<div class="phase-time-group" role="rowgroup">' +
          '<div class="phase-time phase-time-unknown" role="row"><span class="phase-time-mark"></span><span class="phase-time-label">並列 2–3</span><span class="phase-time-value">不明</span><span class="phase-time-ratio"></span></div>' +
          '<div class="phase-time phase-time-inner" role="row"><span class="phase-time-label"><span class="phase-time-num">2/3</span>架空の段B</span><span class="phase-time-value">10秒</span><span class="phase-time-ratio"></span></div>' +
          "</div>",
      ),
    )
  })

  it("段の名前と title の HTML をエスケープする", () => {
    const html = phaseTimesMarkdown([known('1/1 <b>"段"</b>', 1_000)])

    expect(html).toBe(
      wrap(
        "1秒",
        band(segment("1/1 &lt;b&gt;&quot;段&quot;&lt;/b&gt; 1秒", 1_000, true)),
        row("1/1", '&lt;b&gt;"段"&lt;/b&gt;', "1秒", "100%", " phase-time-longest"),
      ),
    )
  })
})
