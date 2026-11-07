import { describe, expect, it } from "vitest"

import {
  arrowPadding,
  barEndPadding,
  barEndText,
  barValueText,
  lineEndLabelLines,
  lineEndPadding,
  SERIES_SIDE_PADDING,
  shareLabelRows,
  spreadLabels,
} from "../../../../../src/browser/features/report/renderer/chart-label-layout.ts"

const measure = (text: string): number => text.length * 12

describe("線端の系列名の札", () => {
  const widthsOf = (text: string) =>
    lineEndLabelLines(text, measure, SERIES_SIDE_PADDING).map(measure)

  it("短い名前は1行で、余白が上限より狭い", () => {
    expect(lineEndLabelLines("稼働率（%）", measure, SERIES_SIDE_PADDING)).toEqual(["稼働率（%）"])
    expect(lineEndPadding(widthsOf("稼働率（%）"), SERIES_SIDE_PADDING)).toBeLessThan(
      SERIES_SIDE_PADDING,
    )
  })

  it("長い名前は最後の開き括弧の前で2行に折れ、余白が上限以下", () => {
    expect(lineEndLabelLines("画像の容量（TB）", measure, SERIES_SIDE_PADDING)).toEqual([
      "画像の容量",
      "（TB）",
    ])
    expect(lineEndPadding(widthsOf("画像の容量（TB）"), SERIES_SIDE_PADDING)).toBeLessThanOrEqual(
      SERIES_SIDE_PADDING,
    )
  })

  it("括弧の無い長い名前は1行のままで、余白は上限で止まる", () => {
    const name = "とても長い系列の名前です"
    expect(lineEndLabelLines(name, measure, SERIES_SIDE_PADDING)).toEqual([name])
    expect(lineEndPadding(widthsOf(name), SERIES_SIDE_PADDING)).toBe(SERIES_SIDE_PADDING)
  })

  it("札が無ければ余白は 0", () => {
    expect(lineEndPadding([], SERIES_SIDE_PADDING)).toBe(0)
  })

  it("2行の札と隣の札は縦に重ならない", () => {
    const [first, second] = spreadLabels([100, 102], 14, [28, 14])
    expect((second ?? 0) - (first ?? 0)).toBe(21)
  })
})

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

  it("字が幅に収まらない部分は棒の下の行へ出し、色の四角（13px）と字を合わせた中心を部分の中心に置く", () => {
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
      { row: 0, left: 183.5 },
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
      { row: 1, left: 47 },
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

describe("barEndText", () => {
  it("系列名が無ければ値だけ、あれば値の前に添える", () => {
    expect(barValueText(35)).toBe("35")
    expect(barEndText("架空系列", 35)).toBe("架空系列  35")
  })
})

describe("barEndPadding", () => {
  it("横棒は右に字の幅だけ取り、系列が2つ以上なら系列名の幅（90）より狭くしない", () => {
    expect(barEndPadding(true, 1, 20)).toEqual({ left: 0, right: 26, top: 0, bottom: 0 })
    expect(barEndPadding(true, 1, 40).right).toBeGreaterThan(barEndPadding(true, 1, 20).right)
    expect(barEndPadding(true, 2, 20).right).toBe(90)
    expect(barEndPadding(true, 2, 120).right).toBe(126)
  })

  it("縦棒は上に1行だけ取る", () => {
    expect(barEndPadding(false, 1, 20)).toEqual({ left: 0, right: 0, top: 22, bottom: 0 })
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
