import { describe, expect, it } from "vitest"

import {
  type ReportTimeline,
  timelineBlockSchema,
} from "../../../src/shared/report/timeline-block.ts"
import { TIMELINE_MARK_NAMES, timelineHtml } from "../../../src/shared/report/timeline-markdown.ts"

const timeline = (value: object): ReportTimeline =>
  timelineBlockSchema.parse({ kind: "timeline", ...value })

/** 行と出来事の中の字（名前・ラベル・時刻）を再帰で集める。 */
function writtenTexts(value: unknown): readonly string[] {
  if (typeof value === "string") return value.trim() === "" ? [] : [value.trim()]
  if (typeof value === "number") return [String(value)]
  if (Array.isArray(value)) return value.flatMap(writtenTexts)
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(writtenTexts)
  return []
}

/** 入力の字のうち、出力の HTML に出てこないもの。 */
function missingTexts(block: ReportTimeline): readonly string[] {
  const html = timelineHtml(block)
  return writtenTexts([block.rows, block.events]).filter((text) => !html.includes(text))
}

const clockRows = [
  { name: "架空の受付", start: "14:00", end: "14:12" },
  { name: "架空の計画", start: "14:12", end: "14:25", extra: ["14:31"] },
  { name: "架空の実装", start: "14:25", end: "14:40", extra: ["14:48", "14:55"] },
  { name: "架空の確認", start: "14:55" },
  { name: "架空の検証", start: "14:55", end: "15:02" },
  { name: "架空の受け入れ", start: "15:02", end: "15:06" },
  { name: "架空の振り返り", start: "15:06", end: "15:09" },
  { name: "架空の送り出し", start: "15:09", end: "15:12" },
]

const clock = timeline({
  title: "架空の題",
  rows: clockRows,
  events: [{ at: "14:44", label: "架空の割り込み" }],
  emphasis: ["架空の実装"],
})

describe("timelineHtml", () => {
  it("HH:MM・ISO・分の数のどれでも、行と出来事の字が全部出力に残る", () => {
    const iso = timeline({
      rows: [
        { name: "架空の夜", start: "2026-10-24T22:00", end: "2026-10-25T01:00" },
        { name: "架空の朝", start: "2026-10-25T01:00", end: "2026-10-25T02:00" },
      ],
      events: [{ at: "2026-10-25T00:30", label: "架空の印" }],
    })
    const minutes = timeline({
      rows: [
        { name: "架空の甲", start: 0, end: 12, lane: "架空の役A" },
        { name: "架空の乙", start: "5", end: "30", extra: [36], lane: "架空の役B" },
      ],
    })

    expect(missingTexts(clock)).toEqual([])
    expect(missingTexts(iso)).toEqual([])
    expect(missingTexts(minutes)).toEqual([])
  })

  it("終了が開始より前の行は帯を組まず、その行の字の欠けを同じ照合が見つける", () => {
    const broken = timeline({
      rows: [
        { name: "架空の甲", start: "14:00", end: "14:10" },
        { name: "架空の逆", start: "14:30", end: "14:20" },
      ],
    })

    expect(missingTexts(broken)).toEqual(["架空の逆", "14:30", "14:20"])
  })

  it("出した class は全部 TIMELINE_MARK_NAMES にあり、空行を持たない", () => {
    const html = timelineHtml(clock)
    const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap(([, names]) =>
      (names ?? "").split(" "),
    )
    const known: readonly string[] = TIMELINE_MARK_NAMES

    expect(classes.filter((name) => !known.includes(name))).toEqual([])
    expect(html).not.toMatch(/\n\s*\n/)
  })

  it("14:00〜15:12 の8行は 14:00〜15:20 の9個の目盛りで、差し色・延び・出来事を印で分ける", () => {
    const html = timelineHtml(clock)
    const ticks = [...html.matchAll(/class="timeline-tick"[^>]*>([^<]*)</g)].map(
      ([, label]) => label,
    )

    expect(ticks).toEqual([
      "14:00",
      "14:10",
      "14:20",
      "14:30",
      "14:40",
      "14:50",
      "15:00",
      "15:10",
      "15:20",
    ])
    expect(html.match(/class="timeline-row"/g)).toHaveLength(8)
    expect(html.match(/timeline-bar-emphasis/g)).toHaveLength(1)
    expect(html).toContain('title="14:25–14:40（延び 14:48・14:55）"')
    expect(html.match(/class="timeline-extra"/g)).toHaveLength(3)
    expect(html.match(/class="timeline-point"/g)).toHaveLength(1)
    expect(html.match(/class="timeline-event"/g)).toHaveLength(1)
    expect(html).toContain("timeline-legend-swatch-event")
  })

  it("帯の位置は軸の幅に対する % で書く", () => {
    const html = timelineHtml(
      timeline({
        rows: [
          { name: "架空の甲", start: 0, end: 10 },
          { name: "架空の乙", start: 5, end: 7 },
        ],
      }),
    )

    expect(html).toContain('style="margin-left: 50%; width: 20%"')
    expect(html).toContain('class="timeline-tick" style="width: 20%"')
  })

  it("使っていない見た目は凡例に出さず、どれも使わなければ凡例そのものを出さない", () => {
    const plain = timelineHtml(timeline({ rows: [{ name: "架空", start: 0, end: 10 }] }))
    const withEvent = timelineHtml(
      timeline({
        rows: [{ name: "架空", start: 0, end: 10 }],
        events: [{ at: 5, label: "架空の印" }],
      }),
    )

    expect(plain).not.toContain("timeline-legend")
    expect(withEvent).toContain("timeline-legend-swatch-event")
    expect(withEvent).not.toContain("timeline-legend-swatch-emphasis")
    expect(withEvent).not.toContain("timeline-legend-swatch-extra")
  })

  it("名前のあるレーンは見出しの行を出し、名前の無い行を先頭にまとめる", () => {
    const html = timelineHtml(
      timeline({
        rows: [
          { name: "架空の甲", start: 0, end: 5, lane: "架空の役" },
          { name: "架空の乙", start: 0, end: 5 },
        ],
      }),
    )

    expect(html.indexOf("架空の乙")).toBeLessThan(html.indexOf("架空の役"))
    expect(html.indexOf("架空の役")).toBeLessThan(html.indexOf("架空の甲"))
    expect(html.match(/class="timeline-lane"/g)).toHaveLength(1)
  })
})
