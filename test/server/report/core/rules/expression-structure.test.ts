import { describe, expect, it } from "vitest"

import {
  a2uiStructureFaultMessage,
  a2uiStructureFaults,
} from "../../../../../src/server/report/core/rules/structure.ts"

type Part = { readonly id: string; readonly [key: string]: unknown }

const slider = (name: string, extra: object = {}) => ({
  id: `slider-${name}`,
  component: "ParameterSlider",
  name,
  label: "架空のつまみ",
  min: 1,
  max: 8,
  step: 1,
  initial: 4,
  ...extra,
})

const checkBox = (name: string, extra: object = {}) => ({
  id: `check-${name}`,
  component: "ParameterCheckBox",
  name,
  label: "架空の切り替え",
  initial: false,
  ...extra,
})

const expr = (source: string) => ({ call: "expr", args: { source } })

const format = (template: string) => ({ call: "format", args: { template } })

const touchable = (
  leaves: readonly Part[],
  options: {
    readonly defs?: Readonly<Record<string, string>>
    readonly tools?: readonly Part[]
  } = {},
) => {
  const tools = options.tools ?? [slider("w"), checkBox("on")]
  const ids = [...tools, ...leaves].map((part) => part.id)
  return [
    {
      id: "root",
      component: "Report",
      conclusion: ["架空の結論。"],
      children: ["s"],
      ...(options.defs === undefined ? {} : { defs: options.defs }),
    },
    { id: "s", component: "Section", heading: "架空の節", children: ids },
    ...tools,
    ...leaves,
  ]
}

const textLeaf = (text: unknown, id = "t") => ({ id, component: "Paragraph", text })

const filler = (id: string) => textLeaf(format("${w}${on}"), id)

const chart = (extra: object = {}) => ({
  id: "c",
  component: "Chart",
  chartKind: "line",
  labels: expr('text(range(1, 3), "本")'),
  series: [{ name: "所要", values: expr("range(1, 3) * w") }],
  ...extra,
})

const faultsOf = (components: readonly unknown[]) =>
  a2uiStructureFaults(components).map((fault) => ({ kind: fault.kind, pointer: fault.pointer }))

describe("a2uiStructureFaults の式の検査", () => {
  it("つまみを読む式と defs を持つ、正しい触れるレポートは通る", () => {
    const components = touchable(
      [
        textLeaf(format("w=${w}、${mode}")),
        chart({ emphasis: expr('at(text(range(1, 3), "本"), 0)') }),
        {
          id: "st",
          component: "Stats",
          items: [
            { label: "a", value: expr("w * 2") },
            { label: "b", value: expr("w") },
            { label: "c", value: format("${w}") },
          ],
        },
      ],
      { defs: { mode: 'on ? "A" : "B"' } },
    )

    expect(faultsOf(components)).toEqual([])
  })

  it.each([
    {
      name: "式の構文: 読めない字",
      components: touchable([textLeaf(expr("w # 2")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-syntax", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "式の構文: 括弧の閉じ忘れ",
      components: touchable([textLeaf(expr("(w + 1")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-syntax", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "式の構文: 余った字",
      components: touchable([textLeaf(expr("w w")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-syntax", pointer: "/components/4/text/args/source" }],
    },
    {
      name: '式の構文: ${…} の中の "',
      components: touchable([textLeaf(format('${on ? "a" : "b"} ${w}'))]),
      faults: [{ kind: "format-literal", pointer: "/components/4/text/args/template" }],
    },
    {
      name: "式の構文: 200 字を超える式",
      components: touchable([textLeaf(expr(`w${" + 1".repeat(60)}`)), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-syntax", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "名前と関数: 無い名前",
      components: touchable([textLeaf(expr("w + missing")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-unknown-name", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "名前と関数: 無い関数",
      components: touchable([textLeaf(expr("zip(w)")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-unknown-function", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "名前と関数: 引数の数の違い",
      components: touchable([textLeaf(expr("at(w)")), textLeaf(expr("on"), "u")]),
      faults: [{ kind: "expression-arity", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "名前と関数: expr・format 以外の call",
      components: touchable([
        textLeaf({ call: "formatNumber", args: { value: 1 } }),
        textLeaf(expr("w + on"), "u"),
      ]),
      faults: [{ kind: "expression-call", pointer: "/components/4/text/call" }],
    },
    {
      name: "defs: 循環",
      components: touchable([textLeaf(expr("a + w + on"))], { defs: { a: "b + 1", b: "a" } }),
      faults: [{ kind: "defs-cycle", pointer: "/components/0/defs/a" }],
    },
    {
      name: "defs: 数の上限",
      components: touchable([textLeaf(expr("w + on + d0"))], {
        defs: Object.fromEntries(Array.from({ length: 21 }, (_, n) => [`d${String(n)}`, "1"])),
      }),
      faults: [{ kind: "defs-too-many", pointer: "/components/0/defs" }],
    },
    {
      name: "defs: 式の構文の誤り",
      components: touchable([textLeaf(expr("a + w + on"))], { defs: { a: "1 +" } }),
      faults: [{ kind: "expression-syntax", pointer: "/components/0/defs/a" }],
    },
    {
      name: "つまみ: name の重なり",
      components: touchable([textLeaf(expr("w + on"))], {
        tools: [slider("w"), slider("w", { id: "dup" }), checkBox("on")],
      }),
      faults: [{ kind: "parameter-name", pointer: "/components/3/name" }],
    },
    {
      name: "つまみ: 関数の名前との重なり",
      components: touchable([textLeaf(expr("on"))], {
        tools: [slider("min"), checkBox("on")],
      }),
      faults: [
        { kind: "parameter-name", pointer: "/components/2/name" },
        { kind: "parameter-unused", pointer: "/components/2/name" },
      ],
    },
    {
      name: "つまみ: defs の名前との重なり",
      components: touchable([textLeaf(expr("w + on"))], { defs: { w: "1" } }),
      faults: [
        { kind: "parameter-name", pointer: "/components/2/name" },
        { kind: "parameter-name", pointer: "/components/0/defs/w" },
      ],
    },
    {
      name: "つまみ: min が max 以上",
      components: touchable([textLeaf(expr("w + on"))], {
        tools: [slider("w", { min: 8, max: 8, initial: 8 }), checkBox("on")],
      }),
      faults: [{ kind: "parameter-range", pointer: "/components/2/max" }],
    },
    {
      name: "つまみ: step が 0 以下",
      components: touchable([textLeaf(expr("w + on"))], {
        tools: [slider("w", { step: 0 }), checkBox("on")],
      }),
      faults: [{ kind: "parameter-range", pointer: "/components/2/step" }],
    },
    {
      name: "つまみ: initial が step の倍数の位置にない",
      components: touchable([textLeaf(expr("w + on"))], {
        tools: [slider("w", { step: 2, initial: 4 }), checkBox("on")],
      }),
      faults: [{ kind: "parameter-range", pointer: "/components/2/initial" }],
    },
    {
      name: "つまみ: 目盛りが 101 個を超える",
      components: touchable([textLeaf(expr("w + on"))], {
        tools: [slider("w", { min: 0, max: 101, initial: 0 }), checkBox("on")],
      }),
      faults: [{ kind: "parameter-range", pointer: "/components/2/step" }],
    },
    {
      name: "つまみ: どの式からも読まれない",
      components: touchable([textLeaf(expr("w * 2"))]),
      faults: [{ kind: "parameter-unused", pointer: "/components/3/name" }],
    },
    {
      name: "歯止め: つまみが 4 個を超える",
      components: touchable([textLeaf(expr("a + b + c + d + e"))], {
        tools: ["a", "b", "c", "d", "e"].map((name) => slider(name)),
      }),
      faults: [{ kind: "parameter-too-many", pointer: "/components/6" }],
    },
    {
      name: "歯止め: 式があるのにつまみが無い",
      components: touchable([textLeaf(expr("1 + 2"))], { tools: [] }),
      faults: [{ kind: "expression-without-parameter", pointer: "/components/2/text" }],
    },
    {
      name: "評価: 初期値で 0 での割り算",
      components: touchable([textLeaf(expr("1 / (w - 4) + on"))]),
      faults: [{ kind: "expression-evaluation", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "評価: つまみを端に振ると範囲の外の at",
      components: touchable([textLeaf(expr("at([1, 2, 3, 4, 5], w - 1) + on"))]),
      faults: [{ kind: "expression-evaluation", pointer: "/components/4/text/args/source" }],
    },
    {
      name: "評価: defs の中の誤りは def の欄を指す",
      components: touchable([textLeaf(format("${a}")), filler("u")], {
        defs: { a: "1 / (w - 4)" },
      }),
      faults: [{ kind: "expression-evaluation", pointer: "/components/0/defs/a" }],
    },
    {
      name: "評価: Paragraph.text が文字にならない",
      components: touchable([textLeaf(expr("[w, 1]")), filler("u")]),
      faults: [{ kind: "expression-shape", pointer: "/components/4/text" }],
    },
    {
      name: "評価: Chart の labels と values の長さが違う",
      components: touchable([chart({ labels: expr('text(range(1, 4), "本")') }), filler("u")]),
      faults: [{ kind: "chart-length-mismatch", pointer: "/components/4/series/0/values" }],
    },
    {
      name: "評価: ChartGrid の2つ目の図の values が labels と長さが違う",
      components: touchable([
        {
          id: "g",
          component: "ChartGrid",
          chartKind: "bar",
          labels: expr('text(range(1, 3), "本")'),
          panels: [
            { heading: "甲", series: [{ name: "所要", values: expr("range(1, 3) * w") }] },
            { heading: "乙", series: [{ name: "所要", values: expr("range(1, 4) * w") }] },
          ],
        },
        filler("u"),
      ]),
      faults: [
        { kind: "chart-length-mismatch", pointer: "/components/4/panels/1/series/0/values" },
      ],
    },
    {
      name: "評価: Chart の emphasis が labels に無い",
      components: touchable([chart({ emphasis: expr('"9本"') }), filler("u")]),
      faults: [{ kind: "chart-emphasis-missing", pointer: "/components/4/emphasis" }],
    },
    {
      name: "評価: Chart の values が数の並びにならない",
      components: touchable([
        chart({ series: [{ name: "所要", values: expr('text(range(1, 3), "本")') }] }),
        filler("u"),
      ]),
      faults: [{ kind: "expression-shape", pointer: "/components/4/series/0/values" }],
    },
  ])("$name を拾う", ({ components, faults }) => {
    expect(faultsOf(components)).toEqual(faults)
  })

  it("エラー文は落ちた欄の JSON Pointer と理由を持つ", () => {
    const [fault] = a2uiStructureFaults(
      touchable([textLeaf(expr("w + missing")), textLeaf(expr("on"), "u")]),
    )

    expect(fault).toBeDefined()
    if (fault === undefined) return
    expect(JSON.parse(a2uiStructureFaultMessage(fault))).toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        path: "/components/4/text/args/source",
        message: expect.stringContaining("missing"),
      },
    })
  })
})
