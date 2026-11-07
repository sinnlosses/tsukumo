import { describe, expect, test } from "vitest"

import {
  type SvgFigureText,
  svgSmallestTextPx,
  svgTextMetricOf,
} from "../../../../scripts/capture/lib/paper-svg-text.ts"

const VIEW_BOX = { width: 100, height: 50 }

function figureOf(boxes: SvgFigureText["boxes"]): SvgFigureText {
  return { viewBox: VIEW_BOX, scale: 1, boxes, fontSizes: [] }
}

describe("svgSmallestTextPx", () => {
  test("図ごとに最小の font-size に縮尺を掛け、mermaid の 16 は使わない", () => {
    const figure: SvgFigureText = { ...figureOf([]), scale: 0.85, fontSizes: [14, 12] }
    expect(svgSmallestTextPx([figure])[0]).toBeCloseTo(10.2)
  })

  test("字を持たない図は入れない", () => {
    expect(svgSmallestTextPx([figureOf([])])).toStrictEqual([])
  })
})

describe("svgTextMetricOf", () => {
  test("Svg の図が無ければ absent", () => {
    expect(svgTextMetricOf([])).toStrictEqual({ kind: "absent" })
  })

  test("重なる2つの矩形は1組に数える", () => {
    const metric = svgTextMetricOf([
      figureOf([
        { x: 0, y: 0, width: 20, height: 10 },
        { x: 10, y: 5, width: 20, height: 10 },
      ]),
    ])
    expect(metric).toStrictEqual({ kind: "at", figures: 1, overlapping: 1, outside: 0 })
  })

  test("接するだけの矩形は重なりに数えない", () => {
    const metric = svgTextMetricOf([
      figureOf([
        { x: 0, y: 0, width: 20, height: 10 },
        { x: 20, y: 0, width: 20, height: 10 },
      ]),
    ])
    expect(metric).toMatchObject({ overlapping: 0, outside: 0 })
  })

  test("viewBox の外へ出た字は1つに数える", () => {
    const metric = svgTextMetricOf([figureOf([{ x: 90, y: 0, width: 20, height: 10 }])])
    expect(metric).toMatchObject({ overlapping: 0, outside: 1 })
  })

  test("どちらも無い図は 0 で、図の数には字の無い図も入る", () => {
    const metric = svgTextMetricOf([
      figureOf([{ x: 1, y: 1, width: 10, height: 10 }]),
      figureOf([]),
    ])
    expect(metric).toStrictEqual({ kind: "at", figures: 2, overlapping: 0, outside: 0 })
  })
})
