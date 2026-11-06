import { describe, expect, it } from "vitest"

import {
  a2uiReportComponentSchema,
  a2uiWrittenComponentSchema,
  type A2uiReportComponent,
  type A2uiWrittenComponent,
} from "../../../src/shared/report/a2ui-report-catalog.ts"
import {
  reevaluatedReportLeaves,
  staticReportComponents,
  writtenReportView,
} from "../../../src/shared/report/report-static-component-list.ts"

function written(...raw: readonly object[]): readonly A2uiWrittenComponent[] {
  return raw.map((item) => a2uiWrittenComponentSchema.parse(item))
}

const slider = {
  id: "p1",
  component: "ParameterSlider",
  name: "n",
  label: "件数",
  min: 0,
  max: 10,
  step: 1,
  initial: 4,
}
const root = { id: "r", component: "Report", children: ["s"], defs: { double: "n * 2" } }
const stat = (value: unknown) => ({ label: "件", value })
const expr = (source: string) => ({ call: "expr", args: { source } })

function collect(components: readonly A2uiReportComponent[]) {
  return components.find((c) => c.component === "Stats")
}

describe("staticReportComponents", () => {
  it("式を持つ Stats が初期値で文字になる", () => {
    const { components } = staticReportComponents(
      written(root, slider, {
        id: "st",
        component: "Stats",
        items: [stat(expr("double")), stat("1"), stat(expr("n + 0.5"))],
      }),
    )
    const stats = collect(components)
    expect(stats?.component === "Stats" && stats.items.map((i) => i.value)).toEqual([
      "8",
      "1",
      "4.5",
    ])
  })

  it("Chart の labels と values が並びになり format が埋まる", () => {
    const { components } = staticReportComponents(
      written(slider, {
        id: "c",
        component: "Chart",
        chartKind: "bar",
        title: { call: "format", args: { template: "n=${n}" } },
        labels: expr('["a", "b"]'),
        series: [{ name: "s", values: expr("[n, n * 2]") }],
        emphasis: expr('["a"]'),
      }),
    )
    const chart = components.find((c) => c.component === "Chart")
    expect(chart).toMatchObject({ title: "n=4", labels: ["a", "b"] })
    expect(chart?.component === "Chart" && chart.series[0]?.values).toEqual([4, 8])
  })

  it("つまみが Paragraph になり defs が外れる", () => {
    const { components } = staticReportComponents(written(root, slider))
    expect(components[0]).not.toHaveProperty("defs")
    expect(components[1]).toMatchObject({ id: "p1", component: "Paragraph", text: "件数: 4" })
  })

  it("式を持たない一覧は変わらない", () => {
    const plain = [
      a2uiReportComponentSchema.parse({ id: "t", component: "Paragraph", text: "本文" }),
    ]
    expect(staticReportComponents(written(...plain)).components).toEqual(plain)
  })

  it("評価できない部品は含めず id を返す", () => {
    const result = staticReportComponents(
      written(slider, { id: "bad", component: "Paragraph", text: expr("missing") }),
    )
    expect(result.components.map((c) => c.id)).toEqual(["p1"])
    expect(result.droppedIds).toEqual(["bad"])
  })

  it("評価した結果は静的な schema で読めて、含めた部品が全部残る", () => {
    const input = written(
      root,
      slider,
      { id: "a", component: "Paragraph", text: { call: "format", args: { template: "${n}" } } },
      { id: "b", component: "Paragraph", text: "x" },
    )
    const { components } = staticReportComponents(input)
    expect(components.map((c) => c.id)).toEqual(input.map((c) => c.id))
    for (const component of components) {
      expect(a2uiReportComponentSchema.safeParse(component).success).toBe(true)
    }
    const dropped = staticReportComponents([
      ...input,
      ...written({ id: "z", component: "Paragraph", text: expr("nope") }),
    ])
    expect(dropped.components).toHaveLength(input.length)
    expect(dropped.droppedIds).toEqual(["z"])
  })
})

describe("reevaluatedReportLeaves", () => {
  const statValues = (leaf?: ReturnType<typeof reevaluatedReportLeaves>[string]) =>
    leaf?.component.component === "Stats" ? leaf.component.items.map((item) => item.value) : []
  const format = (template: string) => ({ call: "format", args: { template } })
  const chart = (values: string, emphasis: string) => ({
    id: "c",
    component: "Chart",
    chartKind: "bar",
    title: format("n=${n}"),
    labels: ["a", "b", "c"],
    series: [{ name: "s", values: expr(values) }],
    emphasis: expr(emphasis),
  })

  it("振った値で Stats・Paragraph・Chart の強調が変わる", () => {
    const input = written(
      root,
      slider,
      { id: "st", component: "Stats", items: [stat(expr("double")), stat("1"), stat("2")] },
      { id: "p", component: "Paragraph", text: format("件数は ${n}") },
      chart("[n, 5, 6]", '[at(["a", "b", "c"], argmin([n, 5, 6]))]'),
    )
    const leaves = reevaluatedReportLeaves(input, { n: 8 })
    expect(statValues(leaves.st)).toEqual(["16", "1", "2"])
    expect(leaves.p).toMatchObject({ kind: "drawn", component: { text: "件数は 8" } })
    expect(leaves.c).toMatchObject({
      kind: "drawn",
      component: { title: "n=8", series: [{ values: [8, 5, 6] }], emphasis: ["b"] },
    })
    expect(reevaluatedReportLeaves(input, {}).c).toMatchObject({ component: { emphasis: ["a"] } })
  })

  it("0 での割り算と範囲の外の at は「—」になり、ほかの部品は評価される", () => {
    const input = written(
      slider,
      { id: "p", component: "Paragraph", text: format("${10 / (n - 5)}") },
      {
        id: "st",
        component: "Stats",
        items: [stat(expr("at([1, 2], n)")), stat(expr("n * 2")), stat("1")],
      },
      chart("[n, 1, 2]", '[at(["a", "b", "c"], n)]'),
      { id: "plain", component: "Paragraph", text: "式なし" },
    )
    const leaves = reevaluatedReportLeaves(input, { n: 5 })
    expect(leaves.p).toMatchObject({ component: { text: "—" } })
    expect(statValues(leaves.st)).toEqual(["—", "10", "1"])
    expect(leaves.c).toMatchObject({ kind: "chart-failed", component: { title: "n=5" } })
    expect(Object.keys(leaves)).toEqual(["p", "st", "c"])
  })
})

describe("writtenReportView", () => {
  it("つまみも式も無い一覧は none、あれば扱いと一覧を持つ", () => {
    expect(
      writtenReportView(written({ id: "t", component: "Paragraph", text: "x" }), "operable"),
    ).toEqual({ kind: "none" })
    const input = written(root, slider)
    expect(writtenReportView(input, "locked")).toEqual({ kind: "locked", components: input })
  })
})
