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

describe("phaseTimesMarkdown", () => {
  it("段が無ければ空文字", () => {
    expect(phaseTimesMarkdown([])).toBe("")
  })

  it("見出しの行に、測れた区間の和を「計」として書く", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 20_000),
      known("2/3 架空の段B", 40_000),
      unknown("3/3 架空の段C"),
    ])

    expect(html).toContain('<span class="phase-times-total">計 1分00秒</span>')
  })

  it("帯の区間の長さは時間（ミリ秒）の比で、title に名前と時間を持つ", () => {
    const html = phaseTimesMarkdown([
      known("1/2 架空の段A", 20_000),
      known("2/2 架空の段B", 10_000),
    ])

    expect(html).toContain('title="1/2 架空の段A 20秒" style="flex: 20000 0 0"')
    expect(html).toContain('title="2/2 架空の段B 10秒" style="flex: 10000 0 0"')
  })

  it("割合は時間÷計を整数%に丸める", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 1_000),
      known("2/3 架空の段B", 1_000),
      known("3/3 架空の段C", 1_000),
    ])

    expect(html.match(/<span class="phase-time-ratio">33%<\/span>/g)).toHaveLength(3)
  })

  it("一番長い区間の帯と行にだけ目印を付ける", () => {
    const html = phaseTimesMarkdown([known("1/2 架空の段A", 5_000), known("2/2 架空の段B", 9_000)])

    expect(html.match(/phase-band-longest/g)).toHaveLength(1)
    expect(html.match(/phase-time-longest/g)).toHaveLength(1)
    expect(html).toContain(
      '<span class="phase-band-segment phase-band-longest" title="2/2 架空の段B',
    )
  })

  it("一本道で測れた回は、waterfall を使わず1本の帯のまま", () => {
    const html = phaseTimesMarkdown([known("1/2 架空の段A", 5_000), known("2/2 架空の段B", 9_000)])

    expect(html).toContain('<div class="phase-band" aria-hidden="true">')
    expect(html).not.toContain("phase-waterfall")
  })

  it("測れない段のある回は waterfall で、斜線の欠片を直前の棒の終わりに置く", () => {
    const html = phaseTimesMarkdown([known("1/2 架空の段A", 5_000), unknown("2/2 架空の段B")])

    expect(html).not.toContain("phase-band")
    expect(html).toContain(
      '<div class="phase-waterfall-row"><span class="phase-waterfall-bar phase-waterfall-unknown" title="2/2 架空の段B 不明" style="margin-left: 98%; width: 2%"></span></div>',
    )
    expect(html).toContain(
      '<span class="phase-time-value">不明</span><span class="phase-time-ratio"></span>',
    )
    expect(html).toContain('<span class="phase-time-ratio">100%</span>')
  })

  it("すべて測れなくても壊れず、計は0秒で目印は付かない", () => {
    const html = phaseTimesMarkdown([unknown("1/1 架空の段")])

    expect(html).toContain("計 0秒")
    expect(html).not.toContain("phase-time-longest")
  })

  it("一覧は、並列の段の見出しの行と字下げする中の段の行を1つの包みに入れる", () => {
    const html = phaseTimesMarkdown([known("1/3 架空の段A", 5_000), parallelRows()])

    expect(html).toContain(
      '<div class="phase-time-group" role="rowgroup"><div class="phase-time phase-time-longest" role="row"><span class="phase-time-mark"></span><span class="phase-time-label">並列 2–3</span><span class="phase-time-value">20秒</span><span class="phase-time-ratio">80%</span></div>',
    )
    expect(html).toContain(
      '<div class="phase-time phase-time-inner" role="row"><span class="phase-time-label"><span class="phase-time-num">2/3</span>架空の段B</span><span class="phase-time-value">10秒</span><span class="phase-time-ratio"></span></div>',
    )
    expect(html).toContain("phase-time phase-time-inner phase-time-unknown")
    expect(html).toContain("計 25秒")
  })

  it("並列の回は waterfall で、並列の段の棒を中の段の棒の上に開始の位置と長さで置く", () => {
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
      ...html.matchAll(/title="([^"]+)" style="margin-left: ([\d.]+)%; width: ([\d.]+)%"/g),
    ]
    expect(bars.map(([, title, left, width]) => [title, left, width])).toEqual([
      ["1/4 架空の段A 10秒", "0", "40"],
      ["並列 2–3 10秒", "40", "40"],
      ["2/4 架空の段B 10秒", "40", "40"],
      ["3/4 架空の段C 6秒", "40", "24"],
      ["4/4 架空の段D 5秒", "80", "20"],
    ])
    expect(html.match(/phase-waterfall-longest/g)).toHaveLength(1)
    expect(html).toContain("計 25秒")
  })

  it("段の名前と title の HTML をエスケープする", () => {
    const html = phaseTimesMarkdown([known('1/1 <b>"段"</b>', 1_000)])

    expect(html).not.toContain("<b>")
    expect(html).toContain("&quot;段&quot;")
  })
})
