import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { directLeafViewOf } from "../../../../../../../src/browser/components/page/conversation/components/main-view/direct-leaf-view.tsx"
import { plotDrawingOfPart } from "../../../../../../../src/browser/components/page/conversation/components/main-view/plot-leaf.tsx"
import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { newLeafHtml, oldLeafHtml } from "../../../../../../fixture/direct-leaf-compare.tsx"
import { stubIntersectionObserver } from "../../../../../../fixture/intersection.ts"

vi.mock(
  "../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/vendor-script.ts",
  () => ({ loadVendorScript: () => new Promise(() => {}), preloadVendorScript: () => {} }),
)

beforeAll(async () => {
  stubIntersectionObserver(false)
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Column = {
  name: string
  type: "N" | "O" | "T" | "Q"
  values: (string | number)[]
}

type Relation = "part" | "trend" | "distribution" | "compare" | "correlate"

function pair(question: string, relation: Relation, data: Column[], fold = "", aside = "") {
  return {
    block: { kind: "plot", question, relation, data, form: "auto", fold, aside } as const,
    part: {
      id: "p1",
      component: "Plot",
      question,
      relation,
      data,
      form: "auto",
      fold,
      aside,
    } as const,
  }
}

const NAMES: Column = { name: "架空の工程", type: "N", values: ["甲", "乙", "丙", "丁", "戊"] }
const MINUTES: Column = { name: "分", type: "Q", values: [4, 31, 12, 9, 3] }

type Shape = readonly [string, Relation, readonly Column[]]

const BAR: Shape = ["棒", "part", [NAMES, MINUTES]]
const LINE: Shape = [
  "折れ線",
  "trend",
  [
    { name: "架空の日", type: "T", values: ["1日", "2日", "3日", "4日", "5日"] },
    { name: "甲", type: "Q", values: [4, 7, 9, 12, 15] },
    { name: "乙", type: "Q", values: [9, 8, 8, 7, 6] },
  ],
]
const NUMBER_LINE: Shape = ["数直線", "distribution", [MINUTES]]
const BULLET: Shape = [
  "bullet",
  "compare",
  [
    { name: "架空の項目", type: "N", values: ["甲", "乙", "丙"] },
    { name: "実績", type: "Q", values: [7, 12.5, 3] },
    { name: "目標", type: "Q", values: [10, 10, 8] },
  ],
]
const SCATTER: Shape = [
  "散布",
  "correlate",
  [
    {
      name: "架空の工程",
      type: "N",
      values: [
        "工程1",
        "工程2",
        "工程3",
        "工程4",
        "工程5",
        "工程6",
        "工程7",
        "工程8",
        "工程9",
        "工程10",
        "工程11",
        "極端",
      ],
    },
    { name: "件数", type: "Q", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 80] },
    { name: "分", type: "Q", values: [20, 22, 24, 26, 28, 20, 22, 24, 26, 28, 20, 400] },
  ],
]
const HISTOGRAM: Shape = [
  "ヒストグラム",
  "distribution",
  [
    {
      name: "分",
      type: "Q",
      values: [5, 5, 6, 7, 9, 11, 14, 17, 21, 25, 30, 35, 41, 47, 54, 61, 69, 77, 86, 95, 105, 115],
    },
  ],
]
const TABLE: Shape = [
  "表",
  "compare",
  [
    { name: "架空の担当", type: "N", values: ["甲", "乙", "丙"] },
    { name: "架空の状態", type: "N", values: ["進行中", "待ち", "完了"] },
  ],
]

function build(shape: Shape, fold = "", aside = "") {
  const [name, relation, data] = shape
  const columns = data.map((column) => ({ ...column, values: [...column.values] }))
  return pair(`架空の問い: ${name}`, relation, columns, fold, aside)
}

describe("Plot の部品", () => {
  it.each([
    ["棒", BAR, "chart-block"],
    ["折れ線", LINE, "chart-block"],
    ["数直線", NUMBER_LINE, "number-line"],
    ["bullet", BULLET, "bullet"],
    ["散布", SCATTER, "scatter"],
    ["ヒストグラム", HISTOGRAM, "histogram"],
  ] as const)("%s が旧い描画と一致する", (_name, shape, marker) => {
    const { block, part } = build(shape)

    const fresh = newLeafHtml(block, part)

    expect(fresh).toBe(oldLeafHtml(block))
    expect(fresh).toContain(marker)
  })

  it("図の題は番号つきで本体の下に出る", () => {
    const { block, part } = build(BAR)

    expect(newLeafHtml(block, part)).toMatch(/図 1/)
  })

  it("fold と aside が旧い描画と一致する", () => {
    const { block, part } = build(NUMBER_LINE, "架空の畳み", "架空の傍注")

    const fresh = newLeafHtml(block, part)

    expect(fresh).toBe(oldLeafHtml(block))
    expect(fresh).toContain("<details>")
  })

  it("描く形は申告から決まる（表に落ちる形と図になる形）", () => {
    expect(plotDrawingOfPart(build(TABLE).part).kind).toBe("table")
    expect(plotDrawingOfPart(build(BAR).part).kind).toBe("chart")
  })

  it("散布の点は申告の行を1つも落とさない", () => {
    const drawing = plotDrawingOfPart(build(SCATTER).part)

    expect(drawing.kind === "scatter" ? drawing.scatter.points.length : -1).toBe(12)
  })

  it("表に落ちる形は表の部品が無いので、直接描かず Markdown の経路に残す", () => {
    expect(directLeafViewOf(build(TABLE).part)).toBeUndefined()
    expect(directLeafViewOf(build(BAR).part)).toBeDefined()
  })

  it("図の形はどれも直接描く部品を持つ", () => {
    const shapes = [BAR, LINE, NUMBER_LINE, BULLET, SCATTER, HISTOGRAM]

    expect(shapes.filter((shape) => directLeafViewOf(build(shape).part) === undefined)).toEqual([])
  })
})
