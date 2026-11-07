import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/features/report/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { FigureBlock } from "../../../../../../../src/shared/report/report-block.ts"
import {
  newLeafHtml,
  newLeafTextNodes,
  oldLeafHtml,
  oldLeafTextNodes,
} from "../../../../../../fixture/direct-leaf-compare.tsx"

beforeAll(async () => {
  await loadMarkdown()
})

afterEach(() => {
  cleanup()
})

type Sample = { readonly block: FigureBlock; readonly part: A2uiReportComponent }

const TABLE: Sample = (() => {
  const base = {
    title: "",
    columns: ["名前", "状態", "変化", "札"],
    rows: [
      ["架空のA", { status: "ok", text: "良好" }, { from: "3", to: "5" }, { tag: "札" }],
      ["架空のB", { status: "ng", text: "不良 `x`" }, { from: "`a`", to: "**b**" }, "12"],
    ],
    rest: "",
    fold: "",
    aside: "",
  } satisfies Omit<Extract<A2uiReportComponent, { component: "Table" }>, "id" | "component">
  return {
    block: { kind: "table", ...base },
    part: { id: "t1", component: "Table", ...base },
  }
})()

const COMPARE: Sample = (() => {
  const base = {
    title: "",
    relation: "versus",
    sides: [
      { kind: "points", heading: "架空の案A", points: ["架空の利点", "架空の `a.ts` の欠点"] },
      { kind: "points", heading: "架空の案B", points: ["架空の別の点"] },
    ],
    fold: "",
    aside: "",
  } satisfies Omit<Extract<A2uiReportComponent, { component: "Compare" }>, "id" | "component">
  return {
    block: { kind: "compare", ...base },
    part: { id: "c1", component: "Compare", ...base },
  }
})()

const MESSY_TABLE: Sample = (() => {
  const base = {
    title: "",
    columns: ["名前", "変化"],
    rows: [
      ["架空のA", { from: "x\ny", to: "x\ny" }],
      ["架空のB", { from: "  前 ", to: "  後  " }],
      ["架空のC", { from: "a \n  b", to: "**c**\nd" }],
      ["架空のD", { from: "x\n`y`", to: "\n e \n" }],
    ],
    rest: "",
    fold: "",
    aside: "",
  } satisfies Omit<Extract<A2uiReportComponent, { component: "Table" }>, "id" | "component">
  return {
    block: { kind: "table", ...base },
    part: { id: "t2", component: "Table", ...base },
  }
})()

describe("2つの内容部品は、旧い描画と同じ text ノードの割れ方で字を描く", () => {
  it.each([
    ["Table", TABLE],
    ["Compare", COMPARE],
    ["改行・前後の空白を含む Table", MESSY_TABLE],
  ] as const)("%s", (_name, { block, part }) => {
    expect(newLeafTextNodes(block, part)).toEqual(oldLeafTextNodes(block))
    expect(newLeafHtml(block, part)).toEqual(oldLeafHtml(block))
  })
})
