// 触れるレポートの部品の一覧から、式を結べる欄・名前つきの式・つまみを読み出す。
// 式の構文・名前・評価の検査はここに置かない。落ちた欄を指す違反の型もここに置く。

import { isPlainObject } from "remeda"

export type A2uiExpressionFaultKind =
  | "expression-syntax"
  | "format-literal"
  | "expression-call"
  | "expression-unknown-name"
  | "expression-unknown-function"
  | "expression-arity"
  | "defs-cycle"
  | "defs-too-many"
  | "parameter-name"
  | "parameter-range"
  | "parameter-unused"
  | "parameter-too-many"
  | "expression-without-parameter"
  | "expression-evaluation"
  | "expression-shape"
  | "chart-length-mismatch"
  | "chart-emphasis-missing"

/** 式まわりの違反 1 つ。理由は違反ごとに文にして持つ（名前・位置・短い説明）。 */
export type A2uiExpressionFault = {
  readonly kind: A2uiExpressionFaultKind
  readonly pointer: string
  readonly reason: string
}

export type ComponentPart = {
  readonly props: Readonly<Record<string, unknown>>
  readonly index: number
}

/** 評価した値に求める形。 */
export type Shape = "text" | "text-or-number" | "labels" | "values" | "emphasis"

/** 式（`expr`・`format`）を結んだ欄。`pointer` は結んだ値の欄。 */
export type Slot = {
  readonly pointer: string
  readonly call: "expr" | "format"
  readonly text: string
  readonly shape: Shape
}

export type Parameter =
  | {
      readonly kind: "slider"
      readonly index: number
      readonly name: string
      readonly min: number
      readonly max: number
      readonly step: number
      readonly initial: number
    }
  | {
      readonly kind: "checkbox"
      readonly index: number
      readonly name: string
      readonly initial: boolean
    }

export type Defs = { readonly pointer: string; readonly entries: Readonly<Record<string, string>> }

export function componentParts(components: readonly unknown[]): readonly ComponentPart[] {
  return components.map((component, index) => ({ props: recordOf(component), index }))
}

export function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(value) ? value : {}
}

export function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

export function defsOf(parts: readonly ComponentPart[]): Defs {
  const root = parts.find(({ props }) => props.component === "Report")
  if (root === undefined || !isPlainObject(root.props.defs)) {
    return { pointer: "", entries: {} }
  }
  const entries: Record<string, string> = {}
  for (const [name, source] of Object.entries(root.props.defs)) {
    if (typeof source === "string") entries[name] = source
  }
  return { pointer: `/components/${String(root.index)}/defs`, entries }
}

export function defPointer(defs: Defs, name: string): string {
  return `${defs.pointer}/${escapePointer(name)}`
}

export function parametersOf(parts: readonly ComponentPart[]): readonly Parameter[] {
  return parts.flatMap(({ props, index }): readonly Parameter[] => {
    const { name, initial } = props
    if (typeof name !== "string") return []
    if (props.component === "ParameterCheckBox" && typeof initial === "boolean") {
      return [{ kind: "checkbox", index, name, initial }]
    }
    const { min, max, step } = props
    if (
      props.component === "ParameterSlider" &&
      typeof initial === "number" &&
      typeof min === "number" &&
      typeof max === "number" &&
      typeof step === "number"
    ) {
      return [{ kind: "slider", index, name, min, max, step, initial }]
    }
    return []
  })
}

/** 値が `expr`・`format` の呼び出しなら、その種類と式（テンプレート）の文字を返す。 */
export function expressionCall(
  value: unknown,
): { readonly call: "expr" | "format"; readonly text: string } | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.args)) return undefined
  if (value.call === "expr" && typeof value.args.source === "string") {
    return { call: "expr", text: value.args.source }
  }
  if (value.call === "format" && typeof value.args.template === "string") {
    return { call: "format", text: value.args.template }
  }
  return undefined
}

export function slotsOf(parts: readonly ComponentPart[]): readonly Slot[] {
  return parts.flatMap(({ props, index }) => slotsOfPart(props, `/components/${String(index)}`))
}

/** `expr`・`format` 以外の `call` を持つ値を指す欄（`…/call`）。 */
export function foreignCallFaults(parts: readonly ComponentPart[]): readonly A2uiExpressionFault[] {
  return parts.flatMap(({ props, index }) =>
    foreignCallPointers(props, `/components/${String(index)}`).map(
      (pointer): A2uiExpressionFault => ({
        kind: "expression-call",
        pointer,
        reason: "値に結べる call は expr と format だけ",
      }),
    ),
  )
}

function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1")
}

function slotOf(value: unknown, pointer: string, shape: Shape): readonly Slot[] {
  const call = expressionCall(value)
  return call === undefined ? [] : [{ pointer, ...call, shape }]
}

function slotsOfPart(props: Readonly<Record<string, unknown>>, base: string): readonly Slot[] {
  switch (props.component) {
    case "Paragraph":
      return slotOf(props.text, `${base}/text`, "text")
    case "Stats":
      return arrayOf(props.items).flatMap((item, position) =>
        (["value", "before", "target"] as const).flatMap((field) =>
          slotOf(
            recordOf(item)[field],
            `${base}/items/${String(position)}/${field}`,
            "text-or-number",
          ),
        ),
      )
    case "Chart":
      return [
        ...slotOf(props.title, `${base}/title`, "text"),
        ...slotOf(props.labels, `${base}/labels`, "labels"),
        ...arrayOf(props.series).flatMap((series, position) =>
          slotOf(recordOf(series).values, `${base}/series/${String(position)}/values`, "values"),
        ),
        ...slotOf(props.emphasis, `${base}/emphasis`, "emphasis"),
      ]
    case "ChartGrid":
      return [
        ...slotOf(props.title, `${base}/title`, "text"),
        ...slotOf(props.labels, `${base}/labels`, "labels"),
        ...arrayOf(props.panels).flatMap((panel, panelPosition) =>
          arrayOf(recordOf(panel).series).flatMap((series, position) =>
            slotOf(
              recordOf(series).values,
              `${base}/panels/${String(panelPosition)}/series/${String(position)}/values`,
              "values",
            ),
          ),
        ),
      ]
    default:
      return []
  }
}

function foreignCallPointers(value: unknown, pointer: string): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, position) =>
      foreignCallPointers(item, `${pointer}/${String(position)}`),
    )
  }
  if (!isPlainObject(value)) return []
  const own =
    typeof value.call === "string" && value.call !== "expr" && value.call !== "format"
      ? [`${pointer}/call`]
      : []
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, child]) =>
      foreignCallPointers(child, `${pointer}/${escapePointer(key)}`),
    ),
  ]
}
