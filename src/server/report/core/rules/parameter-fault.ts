// 触れるレポートのつまみの部品（`ParameterSlider`・`ParameterCheckBox`）の検査。
// 名前の重なり・値の整合・個数の歯止め・どの式にも読まれないつまみを見る。

import { RESERVED_EXPRESSION_NAMES } from "../../../../shared/report/report-expression-evaluate.ts"
import {
  collectExpressionReferences,
  type ExprNode,
} from "../../../../shared/report/report-expression-parse.ts"
import {
  defPointer,
  type A2uiExpressionFault,
  type Defs,
  type Parameter,
} from "../../../../shared/report/report-expression-slot.ts"

const MAX_PARAMETERS = 4
const MAX_SLIDER_STEPS = 101
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function parameterFaults(
  parameters: readonly Parameter[],
  defs: Defs,
): readonly A2uiExpressionFault[] {
  return [
    ...parameterNameFaults(parameters, defs),
    ...parameters.flatMap(parameterRangeFaults),
    ...parameters.slice(MAX_PARAMETERS).map((parameter): A2uiExpressionFault => ({
      kind: "parameter-too-many",
      pointer: `/components/${String(parameter.index)}`,
      reason: `つまみは ${String(MAX_PARAMETERS)} 個まで`,
    })),
  ]
}

/** 構文木のどれからも名前を読まれないつまみ。 */
export function unusedParameterFaults(
  parameters: readonly Parameter[],
  nodes: readonly ExprNode[],
): readonly A2uiExpressionFault[] {
  const referenced = new Set(nodes.flatMap((node) => collectExpressionReferences(node).names))
  return parameters
    .filter((parameter) => !referenced.has(parameter.name))
    .map((parameter) => ({
      kind: "parameter-unused" as const,
      pointer: `/components/${String(parameter.index)}/name`,
      reason: `つまみ ${parameter.name} をどの式も読んでいない`,
    }))
}

function parameterNameFaults(
  parameters: readonly Parameter[],
  defs: Defs,
): readonly A2uiExpressionFault[] {
  const seen = new Set<string>()
  const fromParameters = parameters.flatMap((parameter): readonly A2uiExpressionFault[] => {
    const pointer = `/components/${String(parameter.index)}/name`
    const problem = nameProblem(parameter.name, seen, defs)
    seen.add(parameter.name)
    return problem === undefined ? [] : [{ kind: "parameter-name", pointer, reason: problem }]
  })
  const fromDefs = Object.keys(defs.entries).flatMap((name): readonly A2uiExpressionFault[] => {
    const problem = !NAME_PATTERN.test(name)
      ? `defs の名前 ${name} は英字か _ で始まり英数字と _ が続く名前にする`
      : RESERVED_EXPRESSION_NAMES.has(name)
        ? `defs の名前 ${name} は関数の名前・true・false と重なる`
        : parameters.some((parameter) => parameter.name === name)
          ? `defs の名前 ${name} がつまみの name と重なる`
          : undefined
    return problem === undefined
      ? []
      : [{ kind: "parameter-name", pointer: defPointer(defs, name), reason: problem }]
  })
  return [...fromParameters, ...fromDefs]
}

function nameProblem(name: string, seen: ReadonlySet<string>, defs: Defs): string | undefined {
  if (!NAME_PATTERN.test(name))
    return `つまみの name ${name} は英字か _ で始まり英数字と _ が続く名前にする`
  if (RESERVED_EXPRESSION_NAMES.has(name))
    return `つまみの name ${name} は関数の名前・true・false と重なる`
  if (seen.has(name)) return `つまみの name ${name} がほかのつまみと重なる`
  return Object.hasOwn(defs.entries, name)
    ? `つまみの name ${name} が defs の名前と重なる`
    : undefined
}

function parameterRangeFaults(parameter: Parameter): readonly A2uiExpressionFault[] {
  if (parameter.kind === "checkbox") return []
  const base = `/components/${String(parameter.index)}`
  const { min, max, step, initial } = parameter
  if (!(min < max)) {
    return [
      { kind: "parameter-range", pointer: `${base}/max`, reason: "max は min より大きくする" },
    ]
  }
  if (!(step > 0)) {
    return [
      { kind: "parameter-range", pointer: `${base}/step`, reason: "step は 0 より大きくする" },
    ]
  }
  const steps = (max - min) / step + 1
  if (steps > MAX_SLIDER_STEPS) {
    return [
      {
        kind: "parameter-range",
        pointer: `${base}/step`,
        reason: `目盛りは ${String(MAX_SLIDER_STEPS)} 個まで（いまは ${String(Math.floor(steps))} 個）`,
      },
    ]
  }
  const offset = (initial - min) / step
  if (initial < min || initial > max || Math.abs(offset - Math.round(offset)) > 1e-9) {
    return [
      {
        kind: "parameter-range",
        pointer: `${base}/initial`,
        reason: "initial は min から max の間で、min から step の倍数の位置にする",
      },
    ]
  }
  return []
}
