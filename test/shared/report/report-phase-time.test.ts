import { describe, expect, it } from "vitest"

import { phaseTimesMarkdown } from "../../../src/shared/report/report-phase-time.ts"

const known = (label: string, milliseconds: number) => ({
  kind: "phase" as const,
  label,
  duration: { kind: "known", milliseconds } as const,
})

const unknown = (label: string) => ({
  kind: "phase" as const,
  label,
  duration: { kind: "unknown" } as const,
})

describe("phaseTimesMarkdown", () => {
  it("段が無ければ空文字", () => {
    expect(phaseTimesMarkdown([])).toBe("")
  })

  it("見出しの行に、帯に出した測れた区間の和を「計」として書く", () => {
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

  it("測れない段は帯に斜線の欠片を置き、一覧は「不明」で割合を空欄にする", () => {
    const html = phaseTimesMarkdown([known("1/2 架空の段A", 5_000), unknown("2/2 架空の段B")])

    expect(html).toContain(
      '<span class="phase-band-segment phase-band-unknown" title="2/2 架空の段B 不明"></span>',
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

  it("まとまりは壁時計1区間を帯に置き、見出しの行と字下げする中の段の行を包みに入れる", () => {
    const html = phaseTimesMarkdown([
      known("1/3 架空の段A", 5_000),
      {
        kind: "parallel",
        label: "並列 2·3",
        wall: { kind: "known", milliseconds: 20_000 },
        phases: [
          { label: "2/3 架空の段B", duration: { kind: "known", milliseconds: 10_000 } },
          { label: "3/3 架空の段C", duration: { kind: "unknown" } },
        ],
      },
    ])

    expect(html.match(/phase-band-segment/g)).toHaveLength(2)
    expect(html).toContain(
      '<div class="phase-time-group" role="rowgroup"><div class="phase-time phase-time-longest" role="row"><span class="phase-time-mark"></span><span class="phase-time-label">並列 2·3</span><span class="phase-time-value">20秒</span><span class="phase-time-ratio">80%</span></div>',
    )
    expect(html).toContain(
      '<div class="phase-time phase-time-inner" role="row"><span class="phase-time-label"><span class="phase-time-num">2/3</span>架空の段B</span><span class="phase-time-value">10秒</span><span class="phase-time-ratio"></span></div>',
    )
    expect(html).toContain("phase-time phase-time-inner phase-time-unknown")
    expect(html).toContain("計 25秒")
  })

  it("段の名前と title の HTML をエスケープする", () => {
    const html = phaseTimesMarkdown([known('1/1 <b>"段"</b>', 1_000)])

    expect(html).not.toContain("<b>")
    expect(html).toContain("&quot;段&quot;")
  })
})
