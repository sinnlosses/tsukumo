// `report` の `a2ui` の版で受けた部品の一覧の、スキーマで言えない構造の規約の検査。
// 部品の props の文面は読まず、ID・`component`・参照の欄だけを見る。

import { isPlainObject } from "remeda"

import {
  FIGURE_COMPONENTS,
  LEAF_COMPONENT_KINDS,
  REPORT_COMPONENT_SCHEMAS,
} from "../../../shared/report/a2ui-report-catalog.ts"
import { tableIdOfFilterPath, tableRowFilterTexts } from "../../../shared/report/table-view.ts"
import type { ToolErrorField } from "../../../shared/report/tool-error-field.ts"

export type A2uiStructureFaultKind =
  | "unknown-component"
  | "duplicate-id"
  | "missing-root"
  | "root-not-report"
  | "undefined-reference"
  | "report-child-not-section"
  | "nested-section"
  | "misplaced-component"
  | "deep-layout"
  | "figure-not-figure-part"
  | "unreferenced-component"
  | "filter-target-missing"
  | "filter-target-not-filterable"
  | "filter-option-not-in-cells"

/** 違反 1 つ。`pointer` は引数の根からの JSON Pointer（`/components/2/children/0`）。 */
export type A2uiStructureFault = {
  readonly kind: A2uiStructureFaultKind
  readonly pointer: string
}

/** 構造の規約の判定。`rejected` の `text` はそのまま `report` の戻り値になる。 */
export type A2uiStructureVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

/** 違反を記録の落ちた欄の形にする。欄名は JSON Pointer の段を `.` でつなぎ、添字を `n` に畳む（`components.n.children.n`）。 */
export function a2uiStructureFaultField(fault: A2uiStructureFault): ToolErrorField {
  return {
    field: fault.pointer
      .split("/")
      .slice(1)
      .map((step) => (/^\d+$/.test(step) ? "n" : step))
      .join("."),
    code: fault.kind,
  }
}

/**
 * 部品の一覧を `root` から参照で辿り、構造の規約の違反を並べる。違反が無ければ空。
 * 違反のある参照の先も辿るので、1 つの誤りが辿れない部品の違反を連れて出ることはない。
 */
export function a2uiStructureFaults(components: readonly unknown[]): readonly A2uiStructureFault[] {
  const parts = components.map(partOf)
  const faults: A2uiStructureFault[] = []
  const indexById = new Map<string, number>()
  parts.forEach((part, index) => {
    if (part.component === undefined || !Object.hasOwn(REPORT_COMPONENT_SCHEMAS, part.component)) {
      faults.push({ kind: "unknown-component", pointer: `/components/${String(index)}/component` })
    }
    if (part.id === undefined) {
      return
    }
    if (indexById.has(part.id)) {
      faults.push({ kind: "duplicate-id", pointer: `/components/${String(index)}/id` })
      return
    }
    indexById.set(part.id, index)
  })

  const rootIndex = indexById.get(ROOT_ID)
  const reached = new Set<number>()
  if (rootIndex === undefined) {
    faults.push({ kind: "missing-root", pointer: "/components" })
  } else if (parts[rootIndex]?.component !== "Report") {
    faults.push({ kind: "root-not-report", pointer: `/components/${String(rootIndex)}/component` })
  } else {
    reached.add(rootIndex)
    const visit = (index: number, depth: number): void => {
      for (const reference of referencesOf(parts[index], index)) {
        const target = indexById.get(reference.id)
        if (target === undefined) {
          faults.push({ kind: "undefined-reference", pointer: reference.pointer })
          continue
        }
        const component = parts[target]?.component
        const fault = placementFault(reference.slot, component, depth)
        if (fault !== undefined) {
          faults.push({ kind: fault, pointer: reference.pointer })
        }
        if (!reached.has(target)) {
          reached.add(target)
          visit(target, isContainer(component) ? childDepth(reference.slot, depth) : depth)
        }
      }
    }
    visit(rootIndex, 0)
  }

  parts.forEach((part, index) => {
    const unique = part.id === undefined || indexById.get(part.id) === index
    if (unique && !reached.has(index) && index !== rootIndex) {
      faults.push({ kind: "unreferenced-component", pointer: `/components/${String(index)}` })
    }
  })
  faults.push(...filterBindingFaults(parts, indexById))
  return faults
}

const ROOT_ID = "root"

/**
 * `value` を `/view/<TableのID>/filter` に結んだ `ChoicePicker` が、実在する `filterable` な `Table` を指し、
 * 選択肢の値がその表のセル（`filterColumn` があればその列）の文字に完全一致で現れるかを見る。
 * ほかの path は読まない。
 */
function filterBindingFaults(
  parts: readonly ReturnType<typeof partOf>[],
  indexById: ReadonlyMap<string, number>,
): readonly A2uiStructureFault[] {
  return parts.flatMap((part, index): readonly A2uiStructureFault[] => {
    if (part.component !== "ChoicePicker" || !isPlainObject(part.props.value)) {
      return []
    }
    const tableId = tableIdOfFilterPath(part.props.value.path)
    if (tableId === undefined) {
      return []
    }
    const base = `/components/${String(index)}`
    const tableIndex = indexById.get(tableId)
    const table = tableIndex === undefined ? undefined : parts[tableIndex]
    if (table?.component !== "Table") {
      return [{ kind: "filter-target-missing" as const, pointer: `${base}/value/path` }]
    }
    if (table.props.filterable !== true) {
      return [{ kind: "filter-target-not-filterable" as const, pointer: `${base}/value/path` }]
    }
    const texts = new Set(filterTargetTexts(table.props))
    const options: unknown = part.props.options
    return Array.isArray(options)
      ? options.flatMap((option: unknown, position) =>
          isPlainObject(option) && typeof option.value === "string" && !texts.has(option.value)
            ? [
                {
                  kind: "filter-option-not-in-cells" as const,
                  pointer: `${base}/options/${String(position)}/value`,
                },
              ]
            : [],
        )
      : []
  })
}

/** `Table` の絞り込みの対象のセルが持つ文字を全行ぶん集める。 */
function filterTargetTexts(props: Readonly<Record<string, unknown>>): readonly string[] {
  const column = typeof props.filterColumn === "number" ? props.filterColumn : undefined
  const rows: unknown = props.rows
  return Array.isArray(rows) ? rows.flatMap((row: unknown) => tableRowFilterTexts(row, column)) : []
}

/** 子を持つ配置の部品。`ChoicePicker` は子を持たないので入れ子の深さに数えない。 */
const CONTAINERS: ReadonlySet<string> = new Set(["Row", "Column", "Card", "Tabs"])

/** 配置の部品の入れ子の上限。 */
const MAX_LAYOUT_DEPTH = 3

/** 参照の欄の種類。`layout` は配置の部品の子。 */
type Slot = "report-child" | "figure" | "retrospective" | "section-child" | "layout"

type Part = { readonly id: string | undefined; readonly component: string | undefined }

type Reference = { readonly slot: Slot; readonly id: string; readonly pointer: string }

function partOf(value: unknown): Part & { readonly props: Readonly<Record<string, unknown>> } {
  if (!isPlainObject(value)) {
    return { id: undefined, component: undefined, props: {} }
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    component: typeof value.component === "string" ? value.component : undefined,
    props: value,
  }
}

/** 部品が持つ参照の欄を、欄の並びどおりに並べる。 */
function referencesOf(
  part: ReturnType<typeof partOf> | undefined,
  index: number,
): readonly Reference[] {
  if (part === undefined) {
    return []
  }
  const base = `/components/${String(index)}`
  const { props } = part
  switch (part.component) {
    case "Report":
      return [
        ...idList(props.children, `${base}/children`, "report-child"),
        ...(typeof props.figure === "string"
          ? [{ slot: "figure" as const, id: props.figure, pointer: `${base}/figure` }]
          : []),
        ...(isPlainObject(props.retrospective)
          ? idList(props.retrospective.blocks, `${base}/retrospective/blocks`, "retrospective")
          : []),
      ]
    case "Section":
      return idList(props.children, `${base}/children`, "section-child")
    case "Row":
    case "Column":
      return idList(props.children, `${base}/children`, "layout")
    case "Card":
      return typeof props.child === "string"
        ? [{ slot: "layout", id: props.child, pointer: `${base}/child` }]
        : []
    case "Tabs":
      return Array.isArray(props.tabs)
        ? props.tabs.flatMap((tab: unknown, tabIndex) =>
            isPlainObject(tab) && typeof tab.child === "string"
              ? [
                  {
                    slot: "layout" as const,
                    id: tab.child,
                    pointer: `${base}/tabs/${String(tabIndex)}/child`,
                  },
                ]
              : [],
          )
        : []
    default:
      return []
  }
}

function idList(value: unknown, pointer: string, slot: Slot): readonly Reference[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((id: unknown, position) =>
    typeof id === "string" ? [{ slot, id, pointer: `${pointer}/${String(position)}` }] : [],
  )
}

/** 参照の欄に、参照先の種類が置けないときの違反。知らない種類は `unknown-component` で拾い済みなので見ない。 */
function placementFault(
  slot: Slot,
  component: string | undefined,
  depth: number,
): A2uiStructureFaultKind | undefined {
  if (component === undefined || !Object.hasOwn(REPORT_COMPONENT_SCHEMAS, component)) {
    return undefined
  }
  switch (slot) {
    case "report-child":
      return component === "Section" ? undefined : "report-child-not-section"
    case "figure":
      return FIGURE_COMPONENTS.includes(component) ? undefined : "figure-not-figure-part"
    case "retrospective":
      return isLeaf(component) ? undefined : "misplaced-component"
    case "section-child":
      if (component === "Section") {
        return "nested-section"
      }
      return component === "Report" ? "misplaced-component" : undefined
    case "layout":
      if (component === "Report" || component === "Section") {
        return "misplaced-component"
      }
      return isContainer(component) && depth >= MAX_LAYOUT_DEPTH ? "deep-layout" : undefined
  }
}

/** 配置の部品の子を読むときの深さ。節の子の配置の部品が 1 階層目。 */
function childDepth(slot: Slot, depth: number): number {
  return slot === "layout" ? depth + 1 : 1
}

function isContainer(component: string | undefined): boolean {
  return component !== undefined && CONTAINERS.has(component)
}

function isLeaf(component: string): boolean {
  return Object.hasOwn(LEAF_COMPONENT_KINDS, component)
}
