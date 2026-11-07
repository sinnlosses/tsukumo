import { describe, expect, it } from "vitest"

import { timelineBlockSchema } from "../../../src/shared/report/timeline-block.ts"
import { timelineLayoutOf } from "../../../src/shared/report/timeline-markdown.ts"

const levelsOf = (events: readonly { readonly at: string; readonly label: string }[]) =>
  timelineLayoutOf(
    timelineBlockSchema.parse({
      kind: "timeline",
      rows: [{ name: "架空の作業", start: "14:00", end: "16:30" }],
      events,
    }),
  ).events.map((event) => event.level)

describe("timelineLayoutOf の出来事の段", () => {
  it("近い時刻の 3 つは、3 つの段に分かれる", () => {
    expect(
      levelsOf([
        { at: "14:02", label: "架空の警報に気づく" },
        { at: "14:05", label: "架空の連絡を送る" },
        { at: "14:11", label: "架空の切り戻しを決める" },
      ]),
    ).toEqual([0, 1, 2])
  })

  it("離れた出来事は、どれも 0 段のまま", () => {
    expect(
      levelsOf([
        { at: "14:00", label: "開始" },
        { at: "15:00", label: "中間" },
        { at: "16:30", label: "終了" },
      ]),
    ).toEqual([0, 0, 0])
  })

  it("前のラベルが終わったあとの出来事は、空いた段へ戻る", () => {
    expect(
      levelsOf([
        { at: "14:00", label: "架空の長い出来事の名前" },
        { at: "14:05", label: "近い" },
        { at: "16:00", label: "遠い" },
      ]),
    ).toEqual([0, 1, 0])
  })

  it("出てくる順が時刻の順でなくても、入力の順に段を返す", () => {
    expect(
      levelsOf([
        { at: "14:05", label: "架空の後の出来事" },
        { at: "14:02", label: "架空の先の出来事" },
      ]),
    ).toEqual([1, 0])
  })

  it("段が全部埋まったら、重ねずに下へ段を足す", () => {
    const levels = levelsOf(
      ["14:00", "14:01", "14:02", "14:03", "14:04", "14:05"].map((at) => ({
        at,
        label: "架空の長めの出来事",
      })),
    )
    expect(levels).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe("timelineLayoutOf の待つ行の矢印と止まりうる区間", () => {
  const plan = timelineLayoutOf(
    timelineBlockSchema.parse({
      kind: "timeline",
      rows: [
        { name: "架空の検索の改善", start: "2026-11-04", end: "2026-11-15" },
        {
          name: "架空の決済の更新",
          start: "2026-11-08",
          end: "2026-11-18",
          uncertain: { until: "2026-11-22", label: "架空の承認待ち" },
        },
        {
          name: "架空の負荷試験",
          start: "2026-11-16",
          end: "2026-11-22",
          after: ["架空の検索の改善"],
        },
        {
          name: "架空の公開の準備",
          start: "2026-11-23",
          end: "2026-11-30",
          after: ["架空の負荷試験", "架空の決済の更新"],
        },
        {
          name: "架空の公開",
          start: "2026-12-01",
          end: "2026-12-03",
          after: ["架空の公開の準備"],
        },
      ],
    }),
  )
  const rows = plan.lanes.flatMap((lane) => lane.rows)

  it("矢印は待たれる行の終わり（止まりうる区間があればその終わり）からこの行の開始へ、間の行と一言の数を持つ", () => {
    expect(rows.map((row) => row.arrows)).toEqual([
      [],
      [],
      [{ from: 40, to: 43.33, rowSpan: 2, laneSpan: 0, labelSpan: 1 }],
      [
        { from: 63.33, to: 66.67, rowSpan: 1, laneSpan: 0, labelSpan: 0 },
        { from: 63.33, to: 66.67, rowSpan: 2, laneSpan: 0, labelSpan: 1 },
      ],
      [{ from: 90, to: 93.33, rowSpan: 1, laneSpan: 0, labelSpan: 0 }],
    ])
  })

  it("止まりうる区間は延びた分の後ろの幅と一言で出し、凡例に止まりうる分を足す", () => {
    const uncertain = rows[1]?.track.kind === "bar" ? rows[1].track.uncertain : undefined

    expect(uncertain?.kind === "shown" && uncertain.label).toBe("架空の承認待ち")
    expect(uncertain?.kind === "shown" && uncertain.width).toBeCloseTo(13.33)
    expect(plan.axis.at(-1)?.label).toBe("12/3")
    expect(plan.legend).toEqual([
      { swatch: "uncertain", label: "止まりうる分" },
      { swatch: "wait", label: "待ち" },
    ])
  })

  it("レーンを跨ぐ矢印は見出しの数を数え、待たれる行が下なら負の向きにする", () => {
    const laned = timelineLayoutOf(
      timelineBlockSchema.parse({
        kind: "timeline",
        rows: [
          { name: "架空の甲", start: 0, end: 10, lane: "架空の役A", after: ["架空の乙"] },
          { name: "架空の乙", start: 10, end: 20, lane: "架空の役B", after: ["架空の丙"] },
          { name: "架空の丙", start: 5, end: 8, lane: "架空の役A" },
        ],
      }),
    )

    expect(laned.lanes.flatMap((lane) => lane.rows.map((row) => [row.name, row.arrows]))).toEqual([
      ["架空の甲", [{ from: 100, to: 0, rowSpan: -2, laneSpan: -1, labelSpan: 0 }]],
      ["架空の丙", []],
      ["架空の乙", [{ from: 40, to: 50, rowSpan: 1, laneSpan: 1, labelSpan: 0 }]],
    ])
  })

  it("描かない行・名前が1つに決まらない行からの矢印は出さない", () => {
    const layout = timelineLayoutOf(
      timelineBlockSchema.parse({
        kind: "timeline",
        rows: [
          { name: "架空の甲", start: "14時", end: "14:10" },
          { name: "架空の乙", start: "14:00", end: "14:10" },
          { name: "架空の乙", start: "14:10", end: "14:20" },
          { name: "架空の丙", start: "14:20", end: "14:30", after: ["架空の甲", "架空の乙"] },
        ],
      }),
    )

    expect(layout.lanes.flatMap((lane) => lane.rows.flatMap((row) => row.arrows))).toEqual([])
  })
})

const tracksOf = (rows: readonly Record<string, unknown>[]) =>
  timelineLayoutOf(timelineBlockSchema.parse({ kind: "timeline", rows })).lanes.flatMap((lane) =>
    lane.rows.map((row) => [row.name, row.track] as const),
  )

const durationsOf = (rows: readonly Record<string, unknown>[]) =>
  tracksOf(rows).map(([, track]) => (track.kind === "bar" ? track.duration : undefined))

const waitsOf = (rows: readonly Record<string, unknown>[]) =>
  tracksOf(rows).map(([name, track]) => [
    name,
    track.kind === "bar" && track.wait.kind === "shown" ? track.wait.label : undefined,
  ])

describe("timelineLayoutOf の所要の字", () => {
  it("clock は時間と分、分の尺度は分、ISO は日と時間で書く", () => {
    expect(durationsOf([{ name: "甲", start: "14:00", end: "15:05" }])).toEqual(["1時間5分"])
    expect(durationsOf([{ name: "甲", start: "14:00", end: "14:25" }])).toEqual(["25分"])
    expect(durationsOf([{ name: "甲", start: 10, end: 35 }])).toEqual(["25分"])
    expect(durationsOf([{ name: "甲", start: "2026-11-20", end: "2026-11-22T03:00" }])).toEqual([
      "2日3時間",
    ])
  })

  it("延びた分があれば最後までの長さにし、一点の行には付けない", () => {
    expect(
      durationsOf([
        { name: "甲", start: "14:00", end: "14:10", extra: ["14:30"] },
        { name: "乙", start: "14:40" },
      ]),
    ).toEqual(["30分", undefined])
  })
})

describe("timelineLayoutOf の待ちの区間", () => {
  const parallel = [
    { name: "型検査", start: "02:10", end: "03:00", lane: "検査" },
    { name: "テスト", start: "02:10", end: "04:30", lane: "検査" },
    { name: "ビルド", start: "04:30", end: "05:00", lane: "出荷", after: ["型検査", "テスト"] },
  ]

  it("並列の2行を待つ行があるとき、先に終わる側だけに出て、待つ相手の無い行には出ない", () => {
    expect(waitsOf(parallel)).toEqual([
      ["型検査", "1時間30分"],
      ["テスト", undefined],
      ["ビルド", undefined],
    ])
  })

  it("延びた分があれば、その最後から測る", () => {
    expect(
      waitsOf([
        { name: "甲", start: "14:00", end: "14:10", extra: ["14:20"] },
        { name: "乙", start: "14:50", end: "15:00", after: ["甲"] },
      ]),
    ).toEqual([
      ["甲", "30分"],
      ["乙", undefined],
    ])
  })

  it("止まりうる区間のある行には出さず、凡例の待ちも出ない", () => {
    const rows = [
      {
        name: "甲",
        start: "14:00",
        end: "14:10",
        uncertain: { until: "14:20", label: "承認待ち" },
      },
      { name: "乙", start: "14:50", end: "15:00", after: ["甲"] },
    ]

    expect(waitsOf(rows).map(([, wait]) => wait)).toEqual([undefined, undefined])
    expect(
      timelineLayoutOf(timelineBlockSchema.parse({ kind: "timeline", rows })).legend.map(
        (item) => item.swatch,
      ),
    ).not.toContain("wait")
  })

  it("待ちがあれば凡例に待ちを足す", () => {
    const { legend } = timelineLayoutOf(
      timelineBlockSchema.parse({ kind: "timeline", rows: parallel }),
    )

    expect(legend).toContainEqual({ swatch: "wait", label: "待ち" })
  })
})
