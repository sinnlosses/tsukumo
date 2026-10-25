import { describe, expect, it } from "vitest"

import { graphFoldHtml } from "../../../src/shared/report/graph-fold-html.ts"
import { graphFoldFigure } from "../../../src/shared/report/graph-fold.ts"

const LONG = [
  "[甲の群]",
  "入口 | 架空の呼び出しを送る",
  "直し | 直す欄だけ",
  "[]",
  "[乙の群]",
  "検査 | 省いた欄は引き継ぐ",
  "判定 | 関門を上から順に",
  "通過",
  "記録",
  "[]",
  "整形",
  "描画",
  "出口",
  "関所 | 呼ばずに止まろうとしたとき",
  "入口 -> 検査: 渡す",
  "検査 -> 判定: 揃える",
  "判定 -> 通過: 違反なし",
  "通過 -> 記録",
  "記録 -> 整形",
  "整形 -> 描画",
  "描画 -> 出口",
  "直し <- 判定: 違反あり",
  "検査 <- 直し: 呼び直す",
  "入口 <- 関所: 呼び直させる",
].join("\n")

type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe("graphFoldFigure", () => {
  it("主経路の長い図の箱は互いに重ならず、どれも viewBox の内側に収まる", () => {
    const figure = graphFoldFigure(LONG)

    expect(figure).toBeDefined()
    const boxes = figure?.boxes ?? []
    expect(boxes).toHaveLength(10)
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(figure?.width ?? 0)
      expect(box.y + box.height).toBeLessThanOrEqual(figure?.height ?? 0)
      for (const other of boxes.slice(index + 1)) {
        expect(overlaps(box, other)).toBe(false)
      }
    }
  })

  it.each([
    ["構成の素材", LONG],
    [
      "名前の長い12節点の一本道",
      Array.from(
        { length: 11 },
        (_, index) =>
          `架空のとても長い名前の節点${String(index)} -> 架空のとても長い名前の節点${String(index + 1)}: 架空の長い辺の語`,
      ).join("\n"),
    ],
  ])("行の幅は viewBox の幅の上限 1000 を超えない（%s）", (_, source) => {
    const figure = graphFoldFigure(source)

    expect(figure).toBeDefined()
    expect(figure?.width ?? Infinity).toBeLessThanOrEqual(1000)
    for (const box of figure?.boxes ?? []) {
      expect(box.x + box.width).toBeLessThanOrEqual(1000)
    }
  })

  it("行を折り返し、縦横比は 3:1 の内側になる", () => {
    const figure = graphFoldFigure(LONG)
    const rows = new Set(figure?.boxes.map(({ y }) => y))

    expect(rows.size).toBeGreaterThan(1)
    expect((figure?.width ?? 0) / (figure?.height ?? 1)).toBeLessThanOrEqual(3)
  })

  it("辺はどれも1本の折れ線になり、戻り道の印を引き継ぐ", () => {
    const figure = graphFoldFigure(LONG)

    expect(figure?.paths).toHaveLength(10)
    expect(figure?.paths.filter(({ returns }) => returns)).toHaveLength(3)
  })

  it("群の囲みは群の外の箱に掛からず、題は群ごとに1つだけ", () => {
    const figure = graphFoldFigure(LONG)
    const members = new Set([0, 1, 2, 3, 4, 5])
    const outside = figure?.boxes.filter(({ node }) => !members.has(node)) ?? []

    for (const frame of figure?.frames ?? []) {
      for (const box of outside) {
        expect(overlaps(frame, box)).toBe(false)
      }
    }
    expect(figure?.frames.filter(({ title }) => title !== "").map(({ title }) => title)).toEqual([
      "甲の群",
      "乙の群",
    ])
  })

  it.each([
    ["主経路が境目より短い", "A -> B\nB -> C\nC -> D\nD -> E\nB -> X"],
    ["主経路に無い節点どうしの辺", "A -> B\nB -> C\nC -> D\nD -> E\nE -> F\nB -> X\nX -> Y"],
    ["戻り道でない辺の輪", "A -> B\nB -> C\nC -> D\nD -> E\nE -> F\nF -> A"],
    ["同じ節点の上の取り合い", "A -> B\nB -> C\nC -> D\nD -> E\nE -> F\nB -> X\nB -> Y"],
  ])("%s図は置かない", (_, source) => {
    expect(graphFoldFigure(source)).toBeUndefined()
  })
})

describe("graphFoldHtml", () => {
  it("svg の塊と同じ包みで、戻り道・群の地・節点の説明の目印を持つ", () => {
    const figure = graphFoldFigure(LONG)
    const html = figure === undefined ? "" : graphFoldHtml(figure)

    expect(html.startsWith('<div class="svg-figure"><svg data-graph="" viewBox=')).toBe(true)
    expect(html).toContain(
      'marker-end="url(#report-svg-arrow)" data-return="" stroke-dasharray="6 4"',
    )
    expect(html).toContain('data-frame="" data-ground="1"')
    expect(html).toContain('data-frame="" data-ground="2"')
    expect(html).toContain('data-sub="">架空の呼び出しを送る</text>')
    expect(html).not.toContain("\n")
  })
})
