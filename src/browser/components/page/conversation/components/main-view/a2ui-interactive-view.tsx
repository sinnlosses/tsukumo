// 操作できる部品（並べ替え・絞り込みのある `Table` と、絞り込みの値を選ぶ `ChoicePicker`）の React 実装。
// 操作の状態は面のデータモデルの `/view/<TableのID>/<キー>` に置き、イベントにも記録にも載せない。

import type { SurfaceModel } from "@a2ui/web_core/v0_9"
import { type ReactElement, useSyncExternalStore } from "react"

import type { A2uiReportPart } from "../../../../../../shared/report/a2ui-report-outline.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { tableViewPath } from "../../../../../../shared/report/table-view.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { filteredRowOrder, type TableSort, visibleRowOrder } from "./domain/a2ui-table-view.ts"
import styles from "./main-view.module.css"
import { TableFigure } from "./table-leaf.tsx"

type DataModel = SurfaceModel<never>["dataModel"]

type InteractiveTableProps = {
  readonly dataModel: DataModel
  readonly part: A2uiReportPart<"Table">
  /** 葉の図表番号・札の色・傍注。整形で落ちた表は値を持たず、何も描かない。 */
  readonly value: LeafValue | undefined
}

/** 見出しごとの並べ替えの押しボタンと、並べ替え・絞り込みを当てた表。使わない `Table` はここを通らない。 */
export function InteractiveTable(props: InteractiveTableProps): ReactElement {
  const { dataModel, part, value } = props
  const sort = useDataPath<TableSort>(dataModel, tableViewPath(part.id, "sort"))
  const filter =
    useDataPath<readonly string[]>(dataModel, tableViewPath(part.id, "filter")) ?? NO_SELECTION
  const order =
    sort === undefined ? filteredRowOrder(part, filter) : visibleRowOrder(part, sort, filter)
  if (value === undefined) {
    return <></>
  }
  return (
    <div>
      {part.sortable === true && (
        <div role="group" aria-label="並べ替え" className={styles["interactive-view-group"]}>
          {part.columns.map((column, index) => {
            const active = sort?.column === index
            return (
              <Button
                key={column}
                variant={active ? "tinted-accent" : "outline"}
                size="action"
                pressed={active ? "on" : "off"}
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["interactive-view-button"]}
                onClick={() => {
                  dataModel.set(
                    tableViewPath(part.id, "sort"),
                    sort === undefined
                      ? { column: index, direction: "asc" }
                      : nextSort(sort, index),
                  )
                }}
              >
                {column}
                {active && (sort.direction === "asc" ? " ▲" : " ▼")}
              </Button>
            )
          })}
        </div>
      )}
      <TableFigure part={part} value={value} rowOrder={order} />
      {order.length === 0 && <p>該当する行はありません</p>}
    </div>
  )
}

type ChoicePickerProps = {
  readonly dataModel: DataModel
  readonly part: A2uiReportPart<"ChoicePicker">
}

/** 選択肢を押しボタンで並べ、選んだ値の並びを `value` の path に書く。path でない `value` はその並びを選択中として見せるだけ。 */
export function ChoicePicker(props: ChoicePickerProps): ReactElement {
  const { dataModel, part } = props
  const path = Array.isArray(part.value) ? undefined : part.value.path
  const bound = useDataPath<readonly string[]>(dataModel, path ?? "/")
  const fixed = Array.isArray(part.value) ? part.value : NO_SELECTION
  const selected = path === undefined ? fixed : Array.isArray(bound) ? bound : NO_SELECTION
  const multiple = part.variant === "multipleSelection"
  return (
    <div
      role="group"
      aria-label={typeof part.label === "string" ? part.label : undefined}
      className={styles["interactive-view-group"]}
    >
      {part.options.map((option) => {
        const on = selected.includes(option.value)
        return (
          <Button
            key={option.value}
            variant={on ? "tinted-accent" : "outline"}
            size="action"
            pressed={on ? "on" : "off"}
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["interactive-view-button"]}
            onClick={() => {
              if (path !== undefined) {
                dataModel.set(path, nextSelection(selected, option.value, multiple))
              }
            }}
          >
            {typeof option.label === "string" ? option.label : option.value}
          </Button>
        )
      })}
    </div>
  )
}

const NO_SELECTION: readonly string[] = []

function useDataPath<Value>(dataModel: DataModel, path: string): Value | undefined {
  return useSyncExternalStore(
    (onChange) => {
      const subscription = dataModel.subscribe(path, onChange)
      return () => {
        subscription.unsubscribe()
      }
    },
    () => dataModel.get<Value | undefined>(path),
  )
}

/** 同じ列を押すたびに 昇順 → 降順 → 並べ替えなし。 */
function nextSort(current: TableSort, column: number): TableSort | undefined {
  if (current.column !== column) {
    return { column, direction: "asc" }
  }
  return current.direction === "asc" ? { column, direction: "desc" } : undefined
}

function nextSelection(
  selected: readonly string[],
  value: string,
  multiple: boolean,
): readonly string[] {
  if (selected.includes(value)) {
    return selected.filter((item) => item !== value)
  }
  return multiple ? [...selected, value] : [value]
}
