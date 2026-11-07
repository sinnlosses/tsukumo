import { describe, expect, it } from "vitest"

import {
  type ReportTimeline,
  timelineBlockSchema,
} from "../../../src/shared/report/timeline-block.ts"
import {
  readTimeline,
  timelineDurationLabel,
  timelineTicks,
} from "../../../src/shared/report/timeline-scale.ts"

type Row = {
  readonly name?: string
  readonly start: string | number
  readonly end?: string | number
  readonly extra?: readonly (string | number)[]
  readonly uncertain?: { readonly until: string | number; readonly label: string }
  readonly after?: readonly string[]
  readonly lane?: string
}

const timeline = (
  rows: readonly Row[],
  rest: {
    readonly events?: readonly { readonly at: string | number; readonly label: string }[]
    readonly emphasis?: readonly string[]
  } = {},
): ReportTimeline =>
  timelineBlockSchema.parse({
    kind: "timeline",
    rows: rows.map((row, index) => ({ name: `架空${String(index + 1)}`, ...row })),
    ...rest,
  })

const reasons = (block: ReportTimeline) =>
  readTimeline(block).faults.map((fault) => [fault.place, fault.reason])

describe("readTimeline", () => {
  it("HH:MM・ISO・分の数（数と数の文字列）は、それぞれの尺度として誤りなく読む", () => {
    const clock = readTimeline(timeline([{ start: "14:00", end: "14:25" }]))
    const iso = readTimeline(
      timeline([{ start: "2026-10-24T14:00", end: "2026-10-24T14:25" }, { start: "2026-10-25" }]),
    )
    const minutes = readTimeline(timeline([{ start: 0, end: "12.5" }]))

    expect([clock.scale, iso.scale, minutes.scale]).toEqual(["clock", "iso", "minutes"])
    expect([clock.faults, iso.faults, minutes.faults]).toEqual([[], [], []])
    expect(clock.rows[0]).toEqual({ start: 840, end: 865, extra: [] })
    expect(minutes.rows[0]).toEqual({ start: 0, end: 12.5, extra: [] })
    expect((iso.rows[0]?.end ?? 0) - (iso.rows[0]?.start ?? 0)).toBe(25)
  })

  it("1つの塊の中で尺度が割れたら、割れた側の値の場所を mixed-scale にする", () => {
    expect(reasons(timeline([{ start: "14:00" }, { start: 30 }]))).toEqual([
      [{ kind: "row", row: 2 }, "mixed-scale"],
    ])
    expect(
      reasons(timeline([{ start: "2026-10-24T14:00Z" }, { start: "2026-10-24T15:00" }])),
    ).toEqual([[{ kind: "row", row: 2 }, "mixed-scale"]])
  })

  it("どの形にも当たらない値・あり得ない日時は unreadable", () => {
    expect(reasons(timeline([{ start: "14時" }, { start: "2026-13-01" }]))).toEqual([
      [{ kind: "row", row: 1 }, "unreadable"],
      [{ kind: "row", row: 2 }, "unreadable"],
    ])
    expect(reasons(timeline([{ start: "25:00" }]))).toEqual([
      [{ kind: "row", row: 1 }, "unreadable"],
    ])
  })

  it("同じレーンで開始が前の行より前なら not-ascending。別のレーンどうしは前後してよい", () => {
    expect(reasons(timeline([{ start: "14:10" }, { start: "14:00" }]))).toEqual([
      [{ kind: "row", row: 2 }, "not-ascending"],
    ])
    expect(
      reasons(
        timeline([
          { start: "14:10", lane: "甲" },
          { start: "14:00", lane: "乙" },
        ]),
      ),
    ).toEqual([])
  })

  it("出来事が前より前、extra が昇順でない・end 以前・一点の行にある、のどれも not-ascending", () => {
    expect(
      reasons(
        timeline([{ start: "14:00", end: "14:30" }], {
          events: [
            { at: "14:20", label: "架空の出来事" },
            { at: "14:10", label: "架空の出来事2" },
          ],
        }),
      ),
    ).toEqual([[{ kind: "event", event: 2 }, "not-ascending"]])
    expect(
      reasons(
        timeline([
          { start: "14:00", end: "14:30", extra: ["14:50", "14:40"] },
          { start: "14:00", end: "14:30", extra: ["14:30"] },
          { start: "14:00", extra: ["14:30"] },
          { start: "14:00", end: "14:30", extra: ["14:40", "14:52"] },
        ]),
      ),
    ).toEqual([
      [{ kind: "row", row: 1 }, "not-ascending"],
      [{ kind: "row", row: 2 }, "not-ascending"],
      [{ kind: "row", row: 3 }, "not-ascending"],
    ])
  })

  it("end が start より前なら end-before-start。end を省いた行は一点で誤りなし", () => {
    expect(reasons(timeline([{ start: "14:30", end: "14:00" }]))).toEqual([
      [{ kind: "row", row: 1 }, "end-before-start"],
    ])
    const point = readTimeline(timeline([{ start: "14:30" }]))
    expect(point.faults).toEqual([])
    expect(point.rows[0]).toEqual({ start: 870, end: undefined, extra: [] })
  })

  it("emphasis に行に無い名前があれば unknown-emphasis", () => {
    expect(reasons(timeline([{ start: 0 }], { emphasis: ["架空1"] }))).toEqual([])
    expect(reasons(timeline([{ start: 0 }], { emphasis: ["架空の無い行"] }))).toEqual([
      [{ kind: "emphasis" }, "unknown-emphasis"],
    ])
  })

  it("after に行に無い名前・空の名前があれば unknown-after、同じ名前の行が2つ以上なら ambiguous-after", () => {
    expect(
      reasons(
        timeline([
          { name: "架空の甲", start: 0, end: 10 },
          { name: "架空の乙", start: 0, end: 10, after: ["架空の無い行"] },
          { name: "架空の丙", start: 0, end: 10, after: [""] },
          { name: "架空の甲", start: 20, end: 30 },
          { name: "架空の丁", start: 30, end: 40, after: ["架空の甲"] },
          { name: "架空の戊", start: 30, end: 40, after: ["架空の乙"] },
        ]),
      ),
    ).toEqual([
      [{ kind: "row", row: 2 }, "unknown-after"],
      [{ kind: "row", row: 3 }, "unknown-after"],
      [{ kind: "row", row: 5 }, "ambiguous-after"],
    ])
  })

  it("after が自分を含めて循環する行それぞれを cyclic-after にし、循環の外から待つ行は誤りにしない", () => {
    expect(
      reasons(
        timeline([
          { name: "架空の甲", start: 0, end: 10, after: ["架空の丙"] },
          { name: "架空の乙", start: 10, end: 20, after: ["架空の甲"] },
          { name: "架空の丙", start: 20, end: 30, after: ["架空の乙"] },
          { name: "架空の丁", start: 30, end: 40, after: ["架空の丙"] },
          { name: "架空の戊", start: 40, end: 50, after: ["架空の戊"] },
        ]),
      ),
    ).toEqual([
      [{ kind: "row", row: 1 }, "cyclic-after"],
      [{ kind: "row", row: 2 }, "cyclic-after"],
      [{ kind: "row", row: 3 }, "cyclic-after"],
      [{ kind: "row", row: 5 }, "cyclic-after"],
    ])
  })

  it("待つ行の開始が待たれる行の終わりより前でも誤りにしない", () => {
    expect(
      reasons(
        timeline([
          { name: "架空の甲", start: 0, end: 30 },
          { name: "架空の乙", start: 10, end: 40, after: ["架空の甲"] },
        ]),
      ),
    ).toEqual([])
  })

  it("uncertain は終わり（extra の最後）より後なら読み、前か同じ・一点の行なら uncertain-before-end", () => {
    const later = readTimeline(
      timeline([
        {
          start: "14:00",
          end: "14:30",
          extra: ["14:40"],
          uncertain: { until: "15:00", label: "" },
        },
      ]),
    )
    expect(later.faults).toEqual([])
    expect(later.rows[0]?.uncertain).toBe(900)
    expect(
      reasons(
        timeline([
          { start: "14:00", end: "14:30", uncertain: { until: "14:30", label: "" } },
          {
            start: "14:00",
            end: "14:30",
            extra: ["14:50"],
            uncertain: { until: "14:40", label: "" },
          },
          { start: "14:00", uncertain: { until: "14:40", label: "" } },
        ]),
      ),
    ).toEqual([
      [{ kind: "row", row: 1 }, "uncertain-before-end"],
      [{ kind: "row", row: 2 }, "uncertain-before-end"],
      [{ kind: "row", row: 3 }, "uncertain-before-end"],
    ])
  })

  it("uncertain の until も読めない値は unreadable、尺度が割れたら mixed-scale、尺度の判別に入る", () => {
    expect(
      reasons(
        timeline([
          { start: "14:00", end: "14:30", uncertain: { until: "15時", label: "" } },
          { start: "14:00", end: "14:30", uncertain: { until: 900, label: "" } },
        ]),
      ),
    ).toEqual([
      [{ kind: "row", row: 1 }, "unreadable"],
      [{ kind: "row", row: 2 }, "mixed-scale"],
    ])
    expect(
      readTimeline(timeline([{ start: "", uncertain: { until: "2026-11-04", label: "" } }])).scale,
    ).toBe("iso")
  })
})

describe("timelineTicks", () => {
  const labels = (min: number, max: number, scale: "clock" | "iso" | "minutes") =>
    timelineTicks(min, max, scale).ticks.map((tick) => tick.label)

  it("区間が8以下になる最小の間隔で切り、端を間隔の倍数に広げる", () => {
    const ticks = timelineTicks(14 * 60, 15 * 60 + 12, "clock")

    expect(ticks.interval).toBe(10)
    expect(ticks.ticks.map((tick) => tick.label)).toEqual([
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
  })

  it("分の数は n分、間隔が60分以上なら n時間", () => {
    expect(timelineTicks(0, 40, "minutes").interval).toBe(5)
    expect(labels(0, 40, "minutes").slice(0, 2)).toEqual(["0分", "5分"])
    expect(labels(0, 300, "minutes").slice(0, 2)).toEqual(["0時間", "1時間"])
  })

  it("ISO は最初の目盛りと日が変わった目盛りだけ日付を添え、間隔が1日以上なら日付だけ", () => {
    const start = readTimeline(timeline([{ start: "2026-10-24T22:00", end: "2026-10-25T02:00" }]))
      .rows[0]

    expect(labels(start?.start ?? 0, start?.end ?? 0, "iso")).toEqual([
      "10/24 22:00",
      "22:30",
      "23:00",
      "23:30",
      "10/25 00:00",
      "00:30",
      "01:00",
      "01:30",
      "02:00",
    ])
    const days = readTimeline(timeline([{ start: "2026-10-24", end: "2026-10-27" }])).rows[0]
    expect(labels(days?.start ?? 0, days?.end ?? 0, "iso")).toEqual([
      "10/24",
      "10/25",
      "10/26",
      "10/27",
    ])
  })

  it("範囲が0でも区間を1つ持つ", () => {
    expect(timelineTicks(30, 30, "minutes").ticks.length).toBe(2)
  })
})

describe("timelineDurationLabel", () => {
  it("尺度ごとに、大きい単位から2つまでで書く", () => {
    expect(timelineDurationLabel(150, "minutes")).toBe("150分")
    expect(timelineDurationLabel(25, "clock")).toBe("25分")
    expect(timelineDurationLabel(60, "clock")).toBe("1時間")
    expect(timelineDurationLabel(65, "clock")).toBe("1時間5分")
    expect(timelineDurationLabel(1440 * 2 + 180, "iso")).toBe("2日3時間")
  })
})
