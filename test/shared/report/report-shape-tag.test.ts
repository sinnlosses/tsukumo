import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import {
  isForbiddenBlock,
  type ReportShapeTag,
} from "../../../src/shared/report/report-shape-tag.ts"

const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "", aside: "" })

const list = (count: number): ReportBlock => ({
  kind: "list",
  style: "bullet",
  items: Array.from({ length: count }, (_, index) => ({
    label: "",
    text: `架空の項目${String(index)}`,
    done: false,
    source: "",
    branch: "",
    branchTone: "warn",
  })),
  fold: "",
  aside: "",
})

const table = (columnCount: number): ReportBlock => {
  const columns = Array.from({ length: columnCount }, (_, index) => `架空の列${String(index)}`)
  const [head = "", ...rest] = columns
  return {
    kind: "table",
    title: "",
    columns: [head, ...rest],
    rows: [columns.map(() => "架空"), columns.map(() => "架空")],
    rest: "",
    fold: "",
    aside: "",
  }
}

const graph: ReportBlock = {
  kind: "graph",
  title: "",
  direction: "TD",
  legend: [],
  source: "架空A -> 架空B: 渡す",
  fold: "",
  aside: "",
}

const image: ReportBlock = {
  kind: "image",
  path: "架空.png",
  caption: "",
  notes: [],
  fold: "",
  aside: "",
}

describe("isForbiddenBlock", () => {
  it.each([
    ["position", text("架空の位置")],
    ["quantity", text("架空は 1 から 2 へ、3 件")],
    ["parallel", table(2)],
    ["parallel", table(1)],
    ["single", list(1)],
  ] satisfies readonly (readonly [ReportShapeTag, ReportBlock])[])(
    "%s の札は %o を許さない",
    (tag, block) => {
      expect(isForbiddenBlock(tag, block)).toBe(true)
    },
  )

  it.each([
    ["cause", graph],
    ["cause", text("架空の原因")],
    ["boundary", text("架空の境目は2文で言い切れる")],
    ["position", image],
    ["time", list(2)],
    ["order", list(2)],
    ["quantity", table(3)],
    ["quantity", text("架空は 1 から 2 へ")],
    ["quantity", text("`架空 1 2 3` と 4")],
    ["choice", table(3)],
    ["attribute", table(3)],
    ["mapping", table(2)],
    ["parallel", list(2)],
    ["parallel", table(3)],
    ["single", text("架空の一言")],
    ["single", list(2)],
  ] satisfies readonly (readonly [ReportShapeTag, ReportBlock])[])(
    "%s の札は %o を許す",
    (tag, block) => {
      expect(isForbiddenBlock(tag, block)).toBe(false)
    },
  )
})
