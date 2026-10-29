import { describe, expect, it } from "vitest"

import { phaseTimesView } from "../../../src/shared/report/report-phase-time.ts"

const at = (milliseconds: number) => ({ kind: "known", milliseconds }) as const

const UNKNOWN = { kind: "unknown" } as const

const known = (label: string, milliseconds: number, start = 0) => ({
  kind: "phase" as const,
  label,
  start: at(start),
  duration: at(milliseconds),
  absence: "none" as const,
})

const absent = (label: string, absence: "none" | "not-started" | "skipped" = "none") => ({
  kind: "phase" as const,
  label,
  start: UNKNOWN,
  duration: UNKNOWN,
  absence,
})

const unknown = (label: string) => absent(label)

const parallelRows = () =>
  ({
    kind: "parallel",
    label: "並列 2–3",
    start: at(5_000),
    wall: at(20_000),
    absence: "none",
    phases: [
      { label: "2/3 架空の段B", start: at(5_000), duration: at(10_000), absence: "none" },
      { label: "3/3 架空の段C", start: UNKNOWN, duration: UNKNOWN, absence: "none" },
    ],
  }) as const

describe("phaseTimesView", () => {
  it("段が無ければ none", () => {
    expect(phaseTimesView([])).toEqual({ kind: "none" })
  })

  it("並列の段が無い回は帯の区間と一覧の行を、字と割合まで決めた値で持つ", () => {
    const view = phaseTimesView([known("1/2 架空の段A", 20_000), known("2/2 架空の段B", 10_000)])

    expect(view).toEqual({
      kind: "times",
      totalText: "計 30秒",
      chart: {
        kind: "band",
        regions: [
          { kind: "segment", title: "1/2 架空の段A 20秒", longest: true, flexGrow: 20_000 },
          { kind: "segment", title: "2/2 架空の段B 10秒", longest: false, flexGrow: 10_000 },
        ],
      },
      rows: [
        {
          kind: "row",
          row: {
            inner: false,
            longest: true,
            unknown: false,
            label: { kind: "numbered", num: "1/2", name: "架空の段A" },
            valueText: "20秒",
            ratioText: "67%",
          },
        },
        {
          kind: "row",
          row: {
            inner: false,
            longest: false,
            unknown: false,
            label: { kind: "numbered", num: "2/2", name: "架空の段B" },
            valueText: "10秒",
            ratioText: "33%",
          },
        },
      ],
    })
  })

  it("並列の段のある回は waterfall で、包みに壁時計の囲みと中の段の棒を入れ、測れない棒は直前の棒の終わりに置く", () => {
    const view = phaseTimesView([known("1/3 架空の段A", 5_000), parallelRows()])

    expect(view.kind === "times" ? view.chart : undefined).toEqual({
      kind: "waterfall",
      lines: [
        {
          kind: "bar",
          title: "1/3 架空の段A 5秒",
          mark: "plain",
          marginLeftPercent: 0,
          widthPercent: 20,
        },
        {
          kind: "group",
          items: [
            {
              kind: "wall",
              title: "並列 2–3 20秒",
              longest: true,
              marginLeftPercent: 20,
              widthPercent: 80,
            },
            {
              kind: "bar",
              title: "2/3 架空の段B 10秒",
              mark: "plain",
              marginLeftPercent: 20,
              widthPercent: 40,
            },
            {
              kind: "bar",
              title: "3/3 架空の段C 不明",
              mark: "unknown",
              marginLeftPercent: 98,
              widthPercent: 2,
            },
          ],
        },
      ],
    })
    expect(view.kind === "times" ? view.rows[1] : undefined).toEqual({
      kind: "group",
      head: {
        inner: false,
        longest: true,
        unknown: false,
        label: { kind: "plain", text: "並列 2–3" },
        valueText: "20秒",
        ratioText: "80%",
      },
      inner: [
        {
          inner: true,
          longest: false,
          unknown: false,
          label: { kind: "numbered", num: "2/3", name: "架空の段B" },
          valueText: "10秒",
          ratioText: "",
        },
        {
          inner: true,
          longest: false,
          unknown: true,
          label: { kind: "numbered", num: "3/3", name: "架空の段C" },
          valueText: "不明",
          ratioText: "",
        },
      ],
    })
  })

  it("測れない段は未着手・飛ばした・不明の字で、帯の区間は斜線、割合は空欄", () => {
    const view = phaseTimesView([
      known("1/4 架空の段A", 20_000),
      unknown("2/4 架空の段B"),
      absent("3/4 架空の段C", "skipped"),
      absent("4/4 架空の段D", "not-started"),
    ])

    expect(view.kind === "times" ? view.chart : undefined).toEqual({
      kind: "band",
      regions: [
        { kind: "segment", title: "1/4 架空の段A 20秒", longest: true, flexGrow: 20_000 },
        { kind: "unknown", title: "2/4 架空の段B 不明" },
        { kind: "unknown", title: "3/4 架空の段C 飛ばした" },
        { kind: "unknown", title: "4/4 架空の段D 未着手" },
      ],
    })
    expect(
      view.kind === "times"
        ? view.rows.map((entry) =>
            entry.kind === "row"
              ? [entry.row.valueText, entry.row.ratioText, entry.row.unknown]
              : [],
          )
        : [],
    ).toEqual([
      ["20秒", "100%", false],
      ["不明", "", true],
      ["飛ばした", "", true],
      ["未着手", "", true],
    ])
  })
})
