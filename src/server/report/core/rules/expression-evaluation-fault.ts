// 触れるレポートの式を、初期値とつまみを 1 つずつ端に振った値で評価して見る検査。
// 評価の誤り・値の形の違い・`Chart` の `labels` と `values` の長さ・`emphasis` を見る。

import {
  createExpressionEvaluator,
  type ExpressionEvaluator,
  type ExprParams,
  type ExprValue,
} from "../../../../shared/report/report-expression-evaluate.ts"
import type { ExprError } from "../../../../shared/report/report-expression-parse.ts"
import {
  arrayOf,
  defPointer,
  expressionCall,
  recordOf,
  type A2uiExpressionFault,
  type ComponentPart,
  type Defs,
  type Parameter,
  type Shape,
  type Slot,
} from "../../../../shared/report/report-expression-slot.ts"

type Config = { readonly params: ExprParams; readonly label: string }

export function evaluationFaults(
  parts: readonly ComponentPart[],
  parameters: readonly Parameter[],
  slots: readonly Slot[],
  defs: Defs,
): readonly A2uiExpressionFault[] {
  const faults: A2uiExpressionFault[] = []
  const reported = new Set<string>()
  const add = (fault: A2uiExpressionFault): void => {
    const key = `${fault.kind}\u0000${fault.pointer}`
    if (reported.has(key)) return
    reported.add(key)
    faults.push(fault)
  }

  for (const config of configsOf(parameters)) {
    const evaluator = createExpressionEvaluator({ params: config.params, defs: defs.entries })

    for (const name of Object.keys(defs.entries)) {
      const result = evaluator.evaluate(name)
      if (!result.ok && result.error.origin.where === "def") {
        add({
          kind: "expression-evaluation",
          pointer: defPointer(defs, result.error.origin.name),
          reason: evaluationReason(`defs の ${result.error.origin.name}`, result.error, config),
        })
      }
    }

    for (const slot of slots) {
      const result =
        slot.call === "expr" ? evaluator.evaluate(slot.text) : evaluator.format(slot.text)
      if (!result.ok) {
        if (result.error.origin.where === "source") {
          add({
            kind: "expression-evaluation",
            pointer: `${slot.pointer}/args/${slot.call === "expr" ? "source" : "template"}`,
            reason: evaluationReason("式", result.error, config),
          })
        }
        continue
      }
      const problem = shapeProblem(slot.shape, result.value)
      if (problem !== undefined) {
        add({
          kind: "expression-shape",
          pointer: slot.pointer,
          reason: `${problem}（${config.label}）`,
        })
      }
    }

    for (const { props, index } of parts) {
      if (props.component === "Chart") {
        chartFaults(props, `/components/${String(index)}`, evaluator, config, add)
      }
    }
  }
  return faults
}

function configsOf(parameters: readonly Parameter[]): readonly Config[] {
  const initial: ExprParams = Object.fromEntries(parameters.map((p) => [p.name, p.initial]))
  const swung = parameters.flatMap((parameter) => {
    const values = parameter.kind === "slider" ? [parameter.min, parameter.max] : [true, false]
    return values.map((value) => ({
      params: { ...initial, [parameter.name]: value },
      label: `${parameter.name} を ${String(value)} に振ったとき`,
    }))
  })
  return [{ params: initial, label: "初期値" }, ...swung]
}

function evaluationReason(label: string, error: ExprError, config: Config): string {
  return `${label}を評価できません（${config.label}、${String(error.at + 1)} 字目）: ${error.reason}`
}

function shapeProblem(shape: Shape, value: ExprValue): string | undefined {
  const list: readonly unknown[] | undefined = Array.isArray(value) ? value : undefined
  switch (shape) {
    case "text":
      return typeof value === "string" ? undefined : "ここは文字になる式にする"
    case "text-or-number":
      return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
        ? undefined
        : "ここは文字か数になる式にする"
    case "labels":
      return list !== undefined && list.length > 0 && list.every((item) => typeof item === "string")
        ? undefined
        : "labels は文字の並びになる式にする"
    case "values":
      return list !== undefined &&
        list.length > 0 &&
        list.every((item) => typeof item === "number" && Number.isFinite(item))
        ? undefined
        : "values は有限の数の並びになる式にする"
    case "emphasis":
      return typeof value === "string" ||
        (list !== undefined && list.every((item) => typeof item === "string"))
        ? undefined
        : "emphasis は文字か文字の並びになる式にする"
  }
}

function chartFaults(
  props: Readonly<Record<string, unknown>>,
  base: string,
  evaluator: ExpressionEvaluator,
  config: Config,
  add: (fault: A2uiExpressionFault) => void,
): void {
  const resolve = (value: unknown): ExprValue | readonly unknown[] | undefined => {
    const call = expressionCall(value)
    if (call === undefined) {
      return typeof value === "string" || Array.isArray(value) ? value : undefined
    }
    const result =
      call.call === "expr" ? evaluator.evaluate(call.text) : evaluator.format(call.text)
    return result.ok ? result.value : undefined
  }
  const labels = resolve(props.labels)
  if (!Array.isArray(labels)) return
  arrayOf(props.series).forEach((series, position) => {
    const raw = recordOf(series).values
    const values = resolve(raw)
    const bound = expressionCall(props.labels) !== undefined || expressionCall(raw) !== undefined
    if (bound && Array.isArray(values) && values.length !== labels.length) {
      add({
        kind: "chart-length-mismatch",
        pointer: `${base}/series/${String(position)}/values`,
        reason: `labels（${String(labels.length)} 個）と values（${String(values.length)} 個）の長さが違う（${config.label}）`,
      })
    }
  })
  const emphasis = resolve(props.emphasis)
  const picked = typeof emphasis === "string" ? [emphasis] : Array.isArray(emphasis) ? emphasis : []
  const emphasisBound =
    expressionCall(props.labels) !== undefined || expressionCall(props.emphasis) !== undefined
  if (emphasisBound && picked.some((item) => !labels.includes(item))) {
    add({
      kind: "chart-emphasis-missing",
      pointer: `${base}/emphasis`,
      reason: `emphasis が labels に無い（${config.label}）`,
    })
  }
}
