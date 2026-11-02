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
