import { describe, expect, it } from "vitest"

import {
  reportRejectionText,
  reportViolations,
} from "../../../../../src/server/report/core/rules/report-violation.ts"
import type { LeafComponent } from "../../../../../src/shared/report/report-block.ts"
import { draft, kinds } from "../../../../fixture/report-draft-block.ts"

describe("chart の基準線と注記は line に付け、名指しは series と labels の中", () => {
  const chartOf = (
    chartKind: "line" | "bar" | "pie" | "share" | "arrow" | "slope" | "span",
    references: readonly { readonly value: number; readonly label: string }[],
    annotations: readonly {
      readonly label: string
      readonly index: number
      readonly text: string
    }[],
  ): LeafComponent => ({
    kind: "chart",
    title: "",
    chartKind,
    labels: ["架空A", "架空B"],
    series: [
      { name: "架空系列", values: [1, 2] },
      { name: "架空系列2", values: [1, 2] },
    ],
    horizontal: false,
    emphasis: [],
    references,
    annotations,
    fold: "",
    aside: "",
  })
  const reference = { value: 1.5, label: "架空の目標" }

  it.each([
    ["series に無い系列名", chartOf("line", [], [{ label: "架空C", index: 0, text: "x" }])],
    ["labels の数と同じ位置", chartOf("line", [], [{ label: "架空系列", index: 2, text: "x" }])],
    ["bar の基準線", chartOf("bar", [reference], [])],
    ["pie の注記", chartOf("pie", [], [{ label: "架空系列", index: 0, text: "x" }])],
    ["slope の注記", chartOf("slope", [], [{ label: "架空系列", index: 0, text: "x" }])],
    ["span の注記", chartOf("span", [], [{ label: "架空系列", index: 0, text: "x" }])],
    ["share の2つ目の系列名", chartOf("share", [], [{ label: "架空系列2", index: 0, text: "x" }])],
  ])("%s は違反", (_, chart) => {
    const violations = reportViolations(draft([chart]))
    expect(violations).toEqual([{ kind: "chart-annotation-range", count: 1 }])
    expect(reportRejectionText(violations)).toContain("`line` に")
  })

  it.each(["line", "bar", "share", "arrow"] as const)(
    "%s は系列名と位置が範囲の中なら通る",
    (kind) => {
      const refs = kind === "line" ? [reference] : []
      const chart = chartOf(kind, refs, [{ label: "架空系列", index: 1, text: "x" }])
      expect(kinds(draft([chart]))).toEqual([])
    },
  )
})
