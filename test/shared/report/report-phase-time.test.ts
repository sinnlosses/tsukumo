import { describe, expect, it } from "vitest"

import { phaseTimesMarkdown } from "../../../src/shared/report/report-phase-time.ts"

const known = (label: string, milliseconds: number) => ({
  label,
  duration: { kind: "known", milliseconds } as const,
})

describe("phaseTimesMarkdown", () => {
  it("段が無ければ空文字", () => {
    expect(phaseTimesMarkdown([])).toBe("")
  })

  it("棒の長さは一番長い段に対する比", () => {
    const html = phaseTimesMarkdown([
      known("1/2 架空の段A", 20_000),
      known("2/2 架空の段B", 10_000),
    ])

    expect(html).toContain('style="width: 100%"')
    expect(html).toContain('style="width: 50%"')
    expect(html).toContain('<span class="phase-time-value">20秒</span>')
  })

  it("測れない段は棒を出さず「不明」と書き、比は測れた段だけで決める", () => {
    const html = phaseTimesMarkdown([
      known("1/2 架空の段A", 5_000),
      { label: "2/2 架空の段B", duration: { kind: "unknown" } },
    ])

    expect(html.match(/phase-time-bar/g)).toHaveLength(1)
    expect(html).toContain('style="width: 100%"')
    expect(html).toContain('<span class="phase-time-value phase-time-unknown">不明</span>')
  })

  it("すべて0ミリ秒でも棒は0%で描く（見える下限の幅は CSS の min-width が持つ）", () => {
    expect(phaseTimesMarkdown([known("1/1 架空の段", 0)])).toContain('style="width: 0%"')
  })

  it("最長の100倍以上短い測れた段も棒を出し、「不明」にはならない", () => {
    const html = phaseTimesMarkdown([
      known("1/2 架空の段A", 300_000),
      known("2/2 架空の段B", 1_000),
    ])

    expect(html.match(/phase-time-bar/g)).toHaveLength(2)
    expect(html).toContain('style="width: 0%"')
    expect(html).not.toContain("不明")
  })

  it("段の名前の HTML をエスケープする", () => {
    expect(phaseTimesMarkdown([known("1/1 <b>段</b>", 1_000)])).not.toContain("<b>")
  })
})
