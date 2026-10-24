import { describe, expect, it } from "vitest"

import {
  timelineFaultPositions,
  timelineFaults,
} from "../../../../src/server/report/core/timeline-fault.ts"
import { timelineBlockSchema } from "../../../../src/shared/report/timeline-block.ts"

const timeline = (rows: readonly object[], emphasis: readonly string[] = []) =>
  timelineBlockSchema.parse({ kind: "timeline", rows, emphasis })

describe("timelineFaults", () => {
  it("塊の出現順の1始まりと、塊の中の場所を付ける", () => {
    const faults = timelineFaults([
      timeline([{ name: "架空1", start: "14:00", end: "14:10" }]),
      timeline([
        { name: "架空の甲", start: "14:00", end: "14:10" },
        { name: "架空の乙", start: "14:10", end: "14:20" },
        { name: "架空の丙", start: "14:30", end: "14:20" },
      ]),
    ])

    expect(faults).toEqual([
      { block: 2, place: { kind: "row", row: 3 }, reason: "end-before-start" },
    ])
  })
})

describe("timelineFaultPositions", () => {
  it("位置だけを書き、行の名前と時刻の字を出さない", () => {
    const positions = timelineFaultPositions(
      timelineFaults([
        timeline(
          [
            { name: "架空の甲", start: "14:30", end: "14:20" },
            { name: "架空の乙", start: "14:00" },
          ],
          ["架空の無い行"],
        ),
      ]),
    )

    expect(positions).toBe(
      "1個目の `timeline` の 1 行目、1個目の `timeline` の 2 行目、1個目の `timeline` の `emphasis`",
    )
    expect(positions).not.toMatch(/架空|14:/)
  })
})
