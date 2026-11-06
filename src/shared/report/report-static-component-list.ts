// 書き手が書いた部品の一覧（式・つまみ・`defs` を持つ）を、つまみを初期値に置いて評価した静的な一覧にする。
// 式はリテラルに、つまみは「label: 初期値」の `Paragraph` に置き換わる。
// 評価できない部品は静的な一覧に含めず、`id` を返す。
// 会話の画面が振った値で評価し直すときは、誤りの値を落とさず「—」に倒す。

import { omit } from "remeda"

import type { A2uiReportComponent, A2uiWrittenComponent } from "./a2ui-report-catalog.ts"
import {
  createExpressionEvaluator,
  type ExpressionEvaluator,
  type ExprParams,
  type ExprValue,
} from "./report-expression-evaluate.ts"
import {
  type ComponentPart,
  componentParts,
  defsOf,
  expressionCall,
  parametersOf,
  slotsOf,
} from "./report-expression-slot.ts"

export type StaticReportComponents = {
  readonly components: readonly A2uiReportComponent[]
  /** 評価できず、静的な一覧に含めなかった部品の `id`。 */
  readonly droppedIds: readonly string[]
}

/**
 * 会話の画面が振った値で評価し直すための、書き手のままの一覧とつまみの扱い。
 * 確定のレポートは `operable`、草稿は `locked`。つまみも式も無い一覧は `none`。
 */
export type WrittenReportView =
  | { readonly kind: "none" }
  | { readonly kind: "operable" | "locked"; readonly components: readonly A2uiWrittenComponent[] }

/**
 * 振った値で評価し直した内容部品。
 * `chart-failed` は `labels`・`series[].values`・`emphasis` に誤りがあり、図の代わりに「—」を描く `Chart`（`labels`・`series`・`emphasis` は空）
 * か、`labels`・`panels[].series[].values` に誤りがあり、格子ぜんたいの代わりに「—」を描く `ChartGrid`（`labels`・`panels` は空）。
 */
export type ReevaluatedLeaf =
  | { readonly kind: "drawn"; readonly component: A2uiReportComponent }
  | { readonly kind: "chart-failed"; readonly component: ReportOf<"Chart" | "ChartGrid"> }

/** 誤りの出た値を描く字。 */
export const FAILED_VALUE_TEXT = "—"

type Resolved<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

const FAILED = { ok: false } as const

type WrittenOf<Name extends string> = Extract<A2uiWrittenComponent, { component: Name }>

type ReportOf<Name extends string> = Extract<A2uiReportComponent, { component: Name }>

export function staticReportComponents(
  written: readonly A2uiWrittenComponent[],
): StaticReportComponents {
  const parts = componentParts(written)
  const evaluator = createExpressionEvaluator({
    params: initialParamsOf(parts),
    defs: defsOf(parts).entries,
  })
  const components: A2uiReportComponent[] = []
  const droppedIds: string[] = []
  for (const component of written) {
    const result = staticComponent(component, evaluator)
    if (result.ok) components.push(result.value)
    else droppedIds.push(component.id)
  }
  return { components, droppedIds }
}

export function writtenReportView(
  components: readonly A2uiWrittenComponent[],
  kind: "operable" | "locked",
): WrittenReportView {
  const parts = componentParts(components)
  return parametersOf(parts).length === 0 && slotsOf(parts).length === 0
    ? { kind: "none" }
    : { kind, components }
}

/**
 * 式を持つ `Stats`・`Paragraph`・`Chart`・`ChartGrid` を、振った値で評価し直して部品の ID で引けるようにする。
 * `params` に無いつまみは初期値で読む。誤りの値は「—」にし、ほかの部品の評価は続ける。
 */
export function reevaluatedReportLeaves(
  written: readonly A2uiWrittenComponent[],
  params: ExprParams,
): Readonly<Record<string, ReevaluatedLeaf>> {
  const parts = componentParts(written)
  const evaluator = createExpressionEvaluator({
    params: { ...initialParamsOf(parts), ...params },
    defs: defsOf(parts).entries,
  })
  return Object.fromEntries(
    written.flatMap((component) => {
      if (slotsOf(componentParts([component])).length === 0) return []
      const leaf = reevaluatedLeaf(component, evaluator)
      return leaf === undefined ? [] : [[component.id, leaf]]
    }),
  )
}

function initialParamsOf(parts: readonly ComponentPart[]): ExprParams {
  return Object.fromEntries(
    parametersOf(parts).map((parameter) => [parameter.name, parameter.initial]),
  )
}

function reevaluatedLeaf(
  component: A2uiWrittenComponent,
  evaluator: ExpressionEvaluator,
): ReevaluatedLeaf | undefined {
  switch (component.component) {
    case "Paragraph":
      return {
        kind: "drawn",
        component: { ...component, text: orFailedText(resolveText(component.text, evaluator)) },
      }
    case "Stats":
      return {
        kind: "drawn",
        component: {
          ...component,
          items: component.items.map((item) => ({
            ...item,
            value: orFailedText(resolveTextOrNumber(item.value, evaluator)),
            before: orFailedText(resolveTextOrNumber(item.before, evaluator)),
            target: orFailedText(resolveTextOrNumber(item.target, evaluator)),
          })),
        },
      }
    case "Chart": {
      const title = orFailedText(resolveText(component.title, evaluator))
      const data = chartData(component, evaluator)
      return data.ok
        ? { kind: "drawn", component: { ...component, title, ...data.value } }
        : {
            kind: "chart-failed",
            component: { ...component, title, labels: [], series: [], emphasis: [] },
          }
    }
    case "ChartGrid": {
      const title = orFailedText(resolveText(component.title, evaluator))
      const data = chartGridData(component, evaluator)
      return data.ok
        ? { kind: "drawn", component: { ...component, title, ...data.value } }
        : { kind: "chart-failed", component: { ...component, title, labels: [], panels: [] } }
    }
    default:
      return undefined
  }
}

function orFailedText(resolved: Resolved<string>): string {
  return resolved.ok ? resolved.value : FAILED_VALUE_TEXT
}

function staticComponent(
  component: A2uiWrittenComponent,
  evaluator: ExpressionEvaluator,
): Resolved<A2uiReportComponent> {
  switch (component.component) {
    case "Report":
      return { ok: true, value: omit(component, ["defs"]) }
    case "ParameterSlider":
    case "ParameterCheckBox":
      return {
        ok: true,
        value: {
          id: component.id,
          component: "Paragraph",
          text: `${component.label}: ${String(component.initial)}`,
          fold: "",
          aside: "",
        },
      }
    case "Paragraph": {
      const text = resolveText(component.text, evaluator)
      return text.ok ? { ok: true, value: { ...component, text: text.value } } : FAILED
    }
    case "Stats":
      return staticStats(component, evaluator)
    case "Chart":
      return staticChart(component, evaluator)
    case "ChartGrid": {
      const title = resolveText(component.title, evaluator)
      const data = chartGridData(component, evaluator)
      if (!title.ok || !data.ok) return FAILED
      return { ok: true, value: { ...component, title: title.value, ...data.value } }
    }
    default:
      return { ok: true, value: component }
  }
}

function staticStats(
  component: WrittenOf<"Stats">,
  evaluator: ExpressionEvaluator,
): Resolved<A2uiReportComponent> {
  const items = []
  for (const item of component.items) {
    const value = resolveTextOrNumber(item.value, evaluator)
    const before = resolveTextOrNumber(item.before, evaluator)
    const target = resolveTextOrNumber(item.target, evaluator)
    if (!value.ok || !before.ok || !target.ok) return FAILED
    items.push({ ...item, value: value.value, before: before.value, target: target.value })
  }
  return { ok: true, value: { ...component, items } }
}

function staticChart(
  component: WrittenOf<"Chart">,
  evaluator: ExpressionEvaluator,
): Resolved<A2uiReportComponent> {
  const title = resolveText(component.title, evaluator)
  const data = chartData(component, evaluator)
  if (!title.ok || !data.ok) return FAILED
  return { ok: true, value: { ...component, title: title.value, ...data.value } }
}

/** `Chart` の `labels`・`series`・`emphasis`。長さの違いと `labels` に無い強調は誤り。 */
function chartData(
  component: WrittenOf<"Chart">,
  evaluator: ExpressionEvaluator,
): Resolved<Pick<ReportOf<"Chart">, "labels" | "series" | "emphasis">> {
  const labels = resolveTexts(component.labels, evaluator)
  const emphasis = resolveTexts(component.emphasis, evaluator)
  if (!labels.ok || !emphasis.ok) return FAILED
  const series = resolveSeries(component.series, labels.value.length, evaluator)
  if (!series.ok) return FAILED
  if (emphasis.value.some((name) => !labels.value.includes(name))) return FAILED
  return {
    ok: true,
    value: { labels: labels.value, series: series.value, emphasis: emphasis.value },
  }
}

/** `ChartGrid` の `labels`・`panels`。どれかの系列の長さが `labels` と違えば誤り。 */
function chartGridData(
  component: WrittenOf<"ChartGrid">,
  evaluator: ExpressionEvaluator,
): Resolved<Pick<ReportOf<"ChartGrid">, "labels" | "panels">> {
  const labels = resolveTexts(component.labels, evaluator)
  if (!labels.ok) return FAILED
  const panels = []
  for (const panel of component.panels) {
    const series = resolveSeries(panel.series, labels.value.length, evaluator)
    if (!series.ok) return FAILED
    panels.push({ ...panel, series: series.value })
  }
  return { ok: true, value: { labels: labels.value, panels } }
}

function resolveSeries<Entry extends { readonly values: readonly number[] | object }>(
  entries: readonly Entry[],
  length: number,
  evaluator: ExpressionEvaluator,
): Resolved<(Omit<Entry, "values"> & { values: number[] })[]> {
  const series = []
  for (const entry of entries) {
    const values = resolveNumbers(entry.values, evaluator)
    if (!values.ok || values.value.length !== length) return FAILED
    series.push({ ...entry, values: values.value })
  }
  return { ok: true, value: series }
}

/** 欄の値が式の呼び出しなら評価した値、リテラルなら `undefined`。 */
function evaluated(
  value: unknown,
  evaluator: ExpressionEvaluator,
): Resolved<ExprValue> | undefined {
  const call = expressionCall(value)
  if (call === undefined) return undefined
  const result = call.call === "expr" ? evaluator.evaluate(call.text) : evaluator.format(call.text)
  return result.kind === "ok" ? { ok: true, value: result.value } : FAILED
}

function resolveText(value: string | object, evaluator: ExpressionEvaluator): Resolved<string> {
  if (typeof value === "string") return { ok: true, value }
  const result = evaluated(value, evaluator)
  return result?.ok === true && typeof result.value === "string"
    ? { ok: true, value: result.value }
    : FAILED
}

function resolveTextOrNumber(
  value: string | object,
  evaluator: ExpressionEvaluator,
): Resolved<string> {
  if (typeof value === "string") return { ok: true, value }
  const result = evaluated(value, evaluator)
  if (result?.ok !== true) return FAILED
  const { value: scalar } = result
  return typeof scalar === "string" || typeof scalar === "number"
    ? { ok: true, value: String(scalar) }
    : FAILED
}

function resolveTexts(
  value: readonly string[] | object,
  evaluator: ExpressionEvaluator,
): Resolved<string[]> {
  if (Array.isArray(value)) return { ok: true, value: value.filter((v) => typeof v === "string") }
  const result = evaluated(value, evaluator)
  if (result?.ok !== true || typeof result.value === "string" || !Array.isArray(result.value)) {
    return FAILED
  }
  const texts = result.value.filter((item) => typeof item === "string")
  return texts.length === result.value.length ? { ok: true, value: texts } : FAILED
}

function resolveNumbers(
  value: readonly number[] | object,
  evaluator: ExpressionEvaluator,
): Resolved<number[]> {
  if (Array.isArray(value)) return { ok: true, value: value.filter((v) => typeof v === "number") }
  const result = evaluated(value, evaluator)
  if (result?.ok !== true || !Array.isArray(result.value)) return FAILED
  const numbers = result.value.filter((item) => typeof item === "number" && Number.isFinite(item))
  return numbers.length === result.value.length ? { ok: true, value: numbers } : FAILED
}
