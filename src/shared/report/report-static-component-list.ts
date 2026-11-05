// 書き手が書いた部品の一覧（式・つまみ・`defs` を持つ）を、つまみを初期値に置いて評価した静的な一覧にする。
// 式はリテラルに、つまみは「label: 初期値」の `Paragraph` に置き換わる。
// 評価できない部品は静的な一覧に含めず、`id` を返す。

import { omit } from "remeda"

import type { A2uiReportComponent, A2uiWrittenComponent } from "./a2ui-report-catalog.ts"
import {
  createExpressionEvaluator,
  type ExpressionEvaluator,
  type ExprParams,
  type ExprValue,
} from "./report-expression-evaluate.ts"
import { componentParts, defsOf, expressionCall, parametersOf } from "./report-expression-slot.ts"

export type StaticReportComponents = {
  readonly components: readonly A2uiReportComponent[]
  /** 評価できず、静的な一覧に含めなかった部品の `id`。 */
  readonly droppedIds: readonly string[]
}

type Resolved<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

const FAILED = { ok: false } as const

type WrittenOf<Name extends string> = Extract<A2uiWrittenComponent, { component: Name }>

export function staticReportComponents(
  written: readonly A2uiWrittenComponent[],
): StaticReportComponents {
  const parts = componentParts(written)
  const params: ExprParams = Object.fromEntries(
    parametersOf(parts).map((parameter) => [parameter.name, parameter.initial]),
  )
  const evaluator = createExpressionEvaluator({ params, defs: defsOf(parts).entries })
  const components: A2uiReportComponent[] = []
  const droppedIds: string[] = []
  for (const component of written) {
    const result = staticComponent(component, evaluator)
    if (result.ok) components.push(result.value)
    else droppedIds.push(component.id)
  }
  return { components, droppedIds }
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
  const labels = resolveTexts(component.labels, evaluator)
  const emphasis = resolveTexts(component.emphasis, evaluator)
  if (!title.ok || !labels.ok || !emphasis.ok) return FAILED
  const series = []
  for (const entry of component.series) {
    const values = resolveNumbers(entry.values, evaluator)
    if (!values.ok || values.value.length !== labels.value.length) return FAILED
    series.push({ ...entry, values: values.value })
  }
  if (emphasis.value.some((name) => !labels.value.includes(name))) return FAILED
  return {
    ok: true,
    value: {
      ...component,
      title: title.value,
      labels: labels.value,
      series,
      emphasis: emphasis.value,
    },
  }
}

/** 欄の値が式の呼び出しなら評価した値、リテラルなら `undefined`。 */
function evaluated(
  value: unknown,
  evaluator: ExpressionEvaluator,
): Resolved<ExprValue> | undefined {
  const call = expressionCall(value)
  if (call === undefined) return undefined
  const result = call.call === "expr" ? evaluator.evaluate(call.text) : evaluator.format(call.text)
  return result.ok ? { ok: true, value: result.value } : FAILED
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
