// 触れるレポートの式（`expr`・`format`・`Report.defs`・つまみの部品）の構造の検査の入口。
// 部品の一覧を `a2uiStructureFaults` と同じ JSON Pointer つきの違反にする。
// 式の構文・名前・評価は shared の構文解析器と評価器に任せ、ここは落ちた欄を指す役に徹する。

import {
  staticExpressionError,
  templateExpressions,
} from "../../../../shared/report/report-expression-evaluate.ts"
import {
  collectExpressionReferences,
  MAX_EXPRESSION_DEFS,
  parseExpression,
  type ExprError,
  type ExprNode,
} from "../../../../shared/report/report-expression-parse.ts"
import { evaluationFaults } from "./expression-evaluation-fault.ts"
import {
  componentParts,
  defPointer,
  defsOf,
  foreignCallFaults,
  parametersOf,
  slotsOf,
  type A2uiExpressionFault,
  type A2uiExpressionFaultKind,
  type Defs,
  type Slot,
} from "./expression-slot.ts"
import { parameterFaults, unusedParameterFaults } from "./parameter-fault.ts"

type SourceText = { readonly pointer: string; readonly node: ExprNode; readonly label: string }

type ParsedSource = {
  readonly faults: readonly A2uiExpressionFault[]
  readonly parsed: readonly SourceText[]
}

/** 部品の一覧の式まわりの違反を並べる。式もつまみも無ければ空。 */
export function expressionFaults(components: readonly unknown[]): readonly A2uiExpressionFault[] {
  const parts = componentParts(components)
  const defs = defsOf(parts)
  const parameters = parametersOf(parts)
  const slots = slotsOf(parts)
  const sources = sourceTexts(slots, defs)
  const syntax = sources.flatMap((source) => source.faults)
  const parsed = sources.flatMap((source) => source.parsed)
  const known = new Set([...parameters.map((p) => p.name), ...Object.keys(defs.entries)])
  const clean = syntax.length === 0

  const structural = [
    ...foreignCallFaults(parts),
    ...syntax,
    ...parsed.flatMap((source) => resolutionFaults(source, known)),
    ...(clean ? cycleFaults(defs, parsed) : []),
    ...parameterFaults(parameters, defs),
    ...guardFaults(parameters.length, defs, slots),
    ...(clean
      ? unusedParameterFaults(
          parameters,
          parsed.map((source) => source.node),
        )
      : []),
  ]
  const hasExpressions = slots.length > 0 || Object.keys(defs.entries).length > 0
  if (structural.length > 0 || !hasExpressions) return structural
  return evaluationFaults(parts, parameters, slots, defs)
}

function sourceTexts(slots: readonly Slot[], defs: Defs): readonly ParsedSource[] {
  const fromSlots = slots.flatMap((slot) =>
    slot.call === "expr"
      ? [parseSource(slot.text, `${slot.pointer}/args/source`, "式")]
      : templateExpressions(slot.text).map((part) =>
          part.source.includes('"')
            ? {
                faults: [
                  {
                    kind: "format-literal" as const,
                    pointer: `${slot.pointer}/args/template`,
                    reason:
                      '${…} の中に文字のリテラル（"）は書けません。文字を返す式は defs に書いて名前で読む',
                  },
                ],
                parsed: [],
              }
            : parseSource(part.source, `${slot.pointer}/args/template`, "${…} の式"),
        ),
  )
  const fromDefs = Object.entries(defs.entries).map(([name, source]) =>
    parseSource(source, defPointer(defs, name), `defs の ${name}`),
  )
  return [...fromSlots, ...fromDefs]
}

function parseSource(source: string, pointer: string, label: string): ParsedSource {
  const result = parseExpression(source)
  if (result.ok) return { faults: [], parsed: [{ pointer, node: result.node, label }] }
  return {
    faults: [
      {
        kind: "expression-syntax",
        pointer,
        reason: `${label}を読めません（${String(result.error.at + 1)} 字目）: ${result.error.reason}`,
      },
    ],
    parsed: [],
  }
}

function resolutionFaults(
  source: SourceText,
  known: ReadonlySet<string>,
): readonly A2uiExpressionFault[] {
  const error = staticExpressionError(source.node, known)
  if (error === undefined) return []
  return [
    {
      kind: resolutionKind(error),
      pointer: source.pointer,
      reason: `${source.label}: ${error.reason}`,
    },
  ]
}

function resolutionKind(error: ExprError): A2uiExpressionFaultKind {
  switch (error.kind) {
    case "unknown-name":
      return "expression-unknown-name"
    case "unknown-function":
      return "expression-unknown-function"
    default:
      return "expression-arity"
  }
}

function cycleFaults(defs: Defs, parsed: readonly SourceText[]): readonly A2uiExpressionFault[] {
  const edges = new Map(
    Object.keys(defs.entries).map((name) => {
      const source = parsed.find((item) => item.pointer === defPointer(defs, name))
      return [
        name,
        source === undefined ? [] : collectExpressionReferences(source.node).names,
      ] as const
    }),
  )
  const finished = new Set<string>()
  const reported = new Set<string>()
  const faults: A2uiExpressionFault[] = []
  const visit = (name: string, stack: readonly string[]): void => {
    if (stack.includes(name)) {
      const ring = [...stack.slice(stack.indexOf(name)), name]
      const head = ring[0] ?? name
      if (!reported.has(head)) {
        reported.add(head)
        faults.push({
          kind: "defs-cycle",
          pointer: defPointer(defs, head),
          reason: `defs が輪になっています: ${ring.join(" → ")}`,
        })
      }
      return
    }
    if (finished.has(name) || !edges.has(name)) return
    for (const next of edges.get(name) ?? []) visit(next, [...stack, name])
    finished.add(name)
  }
  for (const name of edges.keys()) visit(name, [])
  return faults
}

function guardFaults(
  parameterCount: number,
  defs: Defs,
  slots: readonly Slot[],
): readonly A2uiExpressionFault[] {
  const defsCount = Object.keys(defs.entries).length
  const tooManyDefs: readonly A2uiExpressionFault[] =
    defsCount > MAX_EXPRESSION_DEFS
      ? [
          {
            kind: "defs-too-many",
            pointer: defs.pointer,
            reason: `defs は ${String(MAX_EXPRESSION_DEFS)} 個まで（いまは ${String(defsCount)} 個）`,
          },
        ]
      : []
  const without: readonly A2uiExpressionFault[] =
    (slots.length > 0 || defsCount > 0) && parameterCount === 0
      ? [
          {
            kind: "expression-without-parameter",
            pointer: slots[0]?.pointer ?? defs.pointer,
            reason: "つまみが無いので式は要りません。動かない値は式で書かず、リテラルで書く",
          },
        ]
      : []
  return [...tooManyDefs, ...without]
}
