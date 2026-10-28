import { describe, expect, it } from "vitest"

import { graphDrawingOf } from "../../../src/shared/report/graph-drawing.ts"
import { graphFoldDrawingOf } from "../../../src/shared/report/graph-fold-html.ts"
import { graphFoldFigure } from "../../../src/shared/report/graph-fold.ts"
import { svgDrawingOf, svgHtml } from "../../../src/shared/report/report-diagram-markdown.ts"
import { graphLegendItemsOf } from "../../../src/shared/report/report-graph-markdown.ts"
import {
  reportImageAttributes,
  reportImageProps,
} from "../../../src/shared/report/report-image-markdown.ts"
import { timelineBlockSchema } from "../../../src/shared/report/timeline-block.ts"
import { timelineLayoutOf } from "../../../src/shared/report/timeline-markdown.ts"
import { graphMarkdown } from "../../fixture/report-markdown.ts"

const graphOf = (source: string) => ({
  kind: "graph" as const,
  title: "",
  direction: "LR" as const,
  legend: [],
  source,
  fold: "",
  aside: "",
})

const LONG = [
  "入口 | 架空の呼び出しを送る",
  "検査 | 省いた欄は引き継ぐ",
  "判定",
  "通過",
  "記録",
  "整形",
  "描画",
  "出口",
  "入口 -> 検査: 渡す",
  "検査 -> 判定",
  "判定 -> 通過",
  "通過 -> 記録",
  "記録 -> 整形",
  "整形 -> 描画",
  "描画 -> 出口",
].join("\n")

describe("graphDrawingOf", () => {
  it("5 節点以下の一本道はカードの連鎖", () => {
    const drawing = graphDrawingOf(graphOf("甲 -> 乙: 渡す\n乙 -> 丙"))

    expect(drawing.kind).toBe("chain")
    expect(drawing.kind === "chain" ? drawing.chain.map((item) => item.kind) : []).toEqual([
      "card",
      "arrow",
      "card",
      "arrow",
      "card",
    ])
  })

  it("6 節点以上の長い主経路で折り返して置ける図は折り返し", () => {
    expect(graphDrawingOf(graphOf(LONG)).kind).toBe("fold")
  })

  it("分岐のある図は mermaid", () => {
    const drawing = graphDrawingOf(graphOf("甲 -> 乙\n甲 -> 丙"))

    expect(drawing.kind).toBe("mermaid")
  })

  it("選び方は Markdown の組み立てと同じ（連鎖は card-chain、折り返しは data-graph、他は mermaid のフェンス）", () => {
    expect(graphMarkdown("甲 -> 乙")).toContain("card-chain")
    expect(graphMarkdown(LONG)).toContain("data-graph")
    expect(graphMarkdown("甲 -> 乙\n甲 -> 丙")).toContain("```mermaid")
  })
})

describe("timelineLayoutOf", () => {
  const block = timelineBlockSchema.parse({
    kind: "timeline",
    rows: [
      { name: "架空の甲", start: "10:00", end: "10:10", extra: ["10:15"], lane: "架空の役" },
      { name: "架空の乙", start: "10:10" },
      { name: "架空の丙", start: "10:10", end: "10:20" },
    ],
    events: [{ at: "10:12", label: "架空の出来事" }],
    emphasis: ["架空の甲"],
  })

  it("行・出来事の名前と時刻が全部、値に残る", () => {
    const layout = timelineLayoutOf(block)

    expect(layout.lanes.flatMap((lane) => lane.rows.map((row) => row.name)).toSorted()).toEqual(
      ["架空の乙", "架空の丙", "架空の甲"].toSorted(),
    )
    expect(layout.events.map((event) => event.label)).toEqual(["架空の出来事"])
    expect(layout.legend.map((item) => item.swatch)).toEqual([
      "emphasis",
      "plain",
      "extra",
      "point",
      "event",
    ])
  })

  it("行を 1 つ落とすと、残る名前の確かめが落ちる", () => {
    const dropped = timelineLayoutOf({ ...block, rows: block.rows.slice(1) })

    expect(dropped.lanes.flatMap((lane) => lane.rows.map((row) => row.name))).not.toContain(
      "架空の甲",
    )
  })
})

describe("svgDrawingOf", () => {
  const figure = {
    width: 100,
    height: 50,
    legend: [],
    shapes: [
      {
        kind: "rect",
        x: 1,
        y: 2,
        width: 30,
        height: 20,
        label: "架空",
        sub: "説明",
        labelAt: "center",
        tone: "a",
        emphasis: true,
      },
      {
        kind: "line",
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        label: "",
        arrow: true,
        dashed: true,
        tone: "none",
      },
      { kind: "text", x: 5, y: 6, text: "字" },
    ],
  } as const

  it("図形は rect → 題の字 → 説明の字、line、text の順に並ぶ", () => {
    const drawing = svgDrawingOf(figure)

    expect(drawing.primitives.map((primitive) => primitive.kind)).toEqual([
      "rect",
      "text",
      "text",
      "line",
      "text",
    ])
    expect(drawing.arrowMarkerId).toBe("report-svg-arrow")
  })

  it("色の目印は a〜e だけを運び、none は持たない", () => {
    const drawing = svgDrawingOf(figure)

    expect(
      drawing.primitives.flatMap((primitive) => ("tone" in primitive ? [primitive.tone] : [])),
    ).toEqual(["a", undefined])
    expect(svgHtml(figure)).toContain('data-tone="a"')
  })
})

describe("graphFoldDrawingOf", () => {
  it("箱・線・囲みが図の値と同じ数だけ残る", () => {
    const figure = graphFoldFigure(LONG)

    expect(figure).toBeDefined()
    if (figure === undefined) return
    const drawing = graphFoldDrawingOf(figure)

    expect(drawing.boxes).toHaveLength(figure.boxes.length)
    expect(drawing.paths).toHaveLength(figure.paths.length)
    expect(drawing.frames).toHaveLength(figure.frames.length)
  })
})

describe("graphLegendItemsOf", () => {
  it("変えた印・戻り道・色の目印を値で返し、withShapes が偽なら形を出さない", () => {
    const block = {
      ...graphOf("[]\n+ 甲\n乙 | 説明\n丙\n甲 -> 乙\n乙 -> 丙\n丙 <- 乙"),
      legend: [{ tone: "a" as const, label: "架空の色" }],
    }

    expect(graphLegendItemsOf(block, false).map((item) => item.kind)).toEqual([
      "change",
      "change",
      "change",
      "return",
      "tone",
    ])
  })
})

describe("reportImageProps", () => {
  const shelved = {
    kind: "shelved",
    toolUseId: "tool_1",
    sizes: [{ path: "a.png", width: 10, height: 20 }],
    unshelved: ["b.png"],
  } as const

  it("棚にある画像は src と寸法、棚に置けなかった・棚が無いときは src を持たない", () => {
    expect(reportImageProps(shelved, "a.png")).toEqual({
      src: "/report-image/tool_1/a.png",
      size: { width: 10, height: 20 },
    })
    expect(reportImageProps(shelved, "b.png").src).toBeUndefined()
    expect(reportImageProps({ kind: "none" }, "a.png").src).toBeUndefined()
    expect(reportImageAttributes(shelved, "a.png")).toBe(
      ' src="/report-image/tool_1/a.png" width="10" height="20"',
    )
  })
})
