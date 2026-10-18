import { describe, expect, it } from "vitest"

import {
  arrowPadding,
  shareLabelRows,
  spreadLabels,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/chart-direct-label.ts"

describe("shareLabelRows", () => {
  it("幅に収まる部分は棒の中に、部分の中心へ置く", () => {
    expect(
      shareLabelRows(
        [
          { width: 200, textWidth: 100 },
          { width: 100, textWidth: 60 },
        ],
        300,
      ),
    ).toEqual([
      { row: -1, left: 50 },
      { row: -1, left: 220 },
    ])
  })

  it("字が幅に収まらない部分は棒の下の行へ出し、字の中心を部分の中心に置く", () => {
    expect(
      shareLabelRows(
        [
          { width: 200, textWidth: 100 },
          { width: 40, textWidth: 60 },
        ],
        300,
      ),
    ).toEqual([
      { row: -1, left: 50 },
      { row: 0, left: 190 },
    ])
  })

  it("下の字どうしが横で重なるなら次の行へ分け、離れていれば同じ行に置く", () => {
    const rows = shareLabelRows(
      [
        { width: 300, textWidth: 50 },
        { width: 10, textWidth: 40 },
        { width: 10, textWidth: 40 },
        { width: 200, textWidth: 50 },
        { width: 10, textWidth: 40 },
      ],
      530,
    )
    expect(rows.map(({ row }) => row)).toEqual([-1, 0, 1, -1, 0])
  })

  it("端の部分や幅0の部分でも、字は棒の左右の端からはみ出さない", () => {
    expect(
      shareLabelRows(
        [
          { width: 0, textWidth: 30 },
          { width: 96, textWidth: 50 },
          { width: 4, textWidth: 40 },
        ],
        100,
      ),
    ).toEqual([
      { row: 0, left: 0 },
      { row: -1, left: 23 },
      { row: 0, left: 60 },
    ])
  })
})

describe("spreadLabels", () => {
  it("近い2つは gap だけ離し、遠いものは動かさない", () => {
    expect(spreadLabels([10, 12, 100], 14)).toEqual([10, 24, 100])
  })

  it("入力と同じ並びで返し、上から順に押し下げる", () => {
    expect(spreadLabels([50, 10, 12], 14)).toEqual([50, 10, 24])
  })

  it("3つ以上が詰まっていれば連鎖して離す", () => {
    expect(spreadLabels([0, 1, 2], 10)).toEqual([0, 10, 20])
  })
})

describe("arrowPadding", () => {
  it("両側に、矢じり・すき間・数字の幅のはみ出しを取り、左はその外に項目名の列を足す", () => {
    expect(arrowPadding(60, 30)).toEqual({ left: 60 + 12 + 45, right: 45, overhang: 45 })
  })

  it("数字が広いほどはみ出しが増え、項目名の列は数字の幅に食われない", () => {
    expect(arrowPadding(60, 40).overhang).toBeGreaterThan(arrowPadding(60, 30).overhang)
    expect(arrowPadding(60, 40).left - arrowPadding(60, 40).overhang).toBe(60 + 12)
  })
})
