import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { loadMarkdown } from "../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import type { A2uiReportComponent } from "../../../../../../../src/shared/report/a2ui-report-catalog.ts"
import type { SectionBlock } from "../../../../../../../src/shared/report/report-block.ts"
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

type Sample = { readonly block: SectionBlock; readonly part: A2uiReportComponent }

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

const MATRIX: Sample = (() => {
  const base = {
    title: "",
    columns: ["甲", "乙"],
    rows: [
      { name: "架空のA", cells: ["ok", "warn"] },
      { name: "架空のB", cells: ["ng", "na"] },
    ],
    fold: "",
    aside: "",
  } satisfies Omit<Extract<A2uiReportComponent, { component: "Matrix" }>, "id" | "component">
  return {
    block: { kind: "matrix", ...base },
    part: { id: "m1", component: "Matrix", ...base },
  }
})()

const COMPARE: Sample = (() => {
  const base = {
    title: "",
    sides: [
      { heading: "架空の案A", points: ["架空の利点", "架空の `a.ts` の欠点"] },
      { heading: "架空の案B", points: ["架空の別の点"] },
    ],
    fold: "",
    aside: "",
  } satisfies Omit<Extract<A2uiReportComponent, { component: "Compare" }>, "id" | "component">
  return {
    block: { kind: "compare", ...base },
    part: { id: "c1", component: "Compare", ...base },
  }
})()

const STATS: Sample = (() => {
  const plain = { before: "", total: "", series: [], better: "" as const }
  const items = [
    { ...plain, value: "9", label: "架空の落ちた件数", before: "12", total: "48" },
    { ...plain, value: "1", label: "架空の一" },
    { ...plain, value: "2", label: "架空の二", total: "`t`" },
  ]
  return {
    block: { kind: "stats", items, fold: "", aside: "" },
    part: { id: "s1", component: "Stats", items, fold: "", aside: "" },
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

const MESSY_STATS: Sample = (() => {
  const plain = { before: "", total: "", series: [], better: "" as const }
  const items = [
    { ...plain, value: "9", label: "架空の件数", before: " 12\n1 ", total: "4\n8 " },
    { ...plain, value: "1", label: "架空の一", before: "x\n`y`", total: " `t`\nz" },
    { ...plain, value: "2", label: "架空の二" },
  ]
  return {
    block: { kind: "stats", items, fold: "", aside: "" },
    part: { id: "s2", component: "Stats", items, fold: "", aside: "" },
  }
})()

describe("4つの内容部品は、旧い描画と同じ text ノードの割れ方で字を描く", () => {
  it.each([
    ["Table", TABLE],
    ["Matrix", MATRIX],
    ["Compare", COMPARE],
    ["Stats", STATS],
    ["改行・前後の空白を含む Table", MESSY_TABLE],
    ["改行・前後の空白を含む Stats", MESSY_STATS],
  ] as const)("%s", (_name, { block, part }) => {
    expect(newLeafTextNodes(block, part)).toEqual(oldLeafTextNodes(block))
    expect(newLeafHtml(block, part)).toEqual(oldLeafHtml(block))
  })
})
