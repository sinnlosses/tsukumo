// 表と対応表を直接描く部品が共有する表の骨組み。
// 横スクロールの器・見出しの行・10 行で切る本体を、旧い Markdown の表と同じ要素で返す。

import clsx from "clsx"
import { type ReactElement, type ReactNode, useState } from "react"

import type { ColumnAlign } from "../../../../../../shared/report/table-layout.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { FoldedTableBody, tableLeafClassNames } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"

export type LeafTableAlign = ColumnAlign | "center"

export type LeafTableRow = {
  readonly key: string
  readonly cells: readonly ReactNode[]
  /** 開け閉めの印を出す行の詳しい中身。`label` は押しボタンの名前に使う行の名前。 */
  readonly detail: { readonly label: string; readonly content: ReactNode } | undefined
  /** 1列目の字下げの段（0 は寄せない）。 */
  readonly depth: number
}

type LeafTableProps = {
  readonly head: readonly ReactNode[]
  readonly aligns: readonly LeafTableAlign[]
  readonly rows: readonly LeafTableRow[]
  /** 本体の 10 行の切りに入らない末尾の行（合計の行・値の行）。空なら `tfoot` を出さない。 */
  readonly foot: readonly (readonly ReactNode[])[]
}

/** 左揃えは何も付けない（旧い GFM の表は、右と中央を `style` の `text-align` で出す）。 */
const ALIGN_ATTRIBUTES = {
  left: {},
  right: { style: { textAlign: "right" } },
  center: { style: { textAlign: "center" } },
} as const satisfies Record<LeafTableAlign, object>

/** 行が 0 件なら `tbody` を出さない。 */
export function LeafTable(props: LeafTableProps): ReactElement {
  const attributesOf = (index: number) => ALIGN_ATTRIBUTES[props.aligns[index] ?? "left"]
  return (
    <div className={tableLeafClassNames.tableScroll}>
      <table>
        <thead>
          <tr>
            {props.head.map((cell, index) => (
              <th key={`head-${String(index)}`} {...attributesOf(index)}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        {props.rows.length > 0 && (
          <FoldedTableBody
            bodyProps={{}}
            columnCount={Math.max(1, ...props.rows.map((row) => row.cells.length))}
          >
            {props.rows.map((row) => (
              <BodyRow
                key={row.key}
                row={row}
                attributesOf={attributesOf}
                spaced={props.rows.some((other) => other.detail !== undefined)}
              />
            ))}
          </FoldedTableBody>
        )}
        {props.foot.length > 0 && (
          <tfoot>
            {props.foot.map((cells, rowIndex) => (
              <tr key={`foot-${String(rowIndex)}`}>
                {cells.map((cell, index) => (
                  <td key={`foot-${String(rowIndex)}-${String(index)}`} {...attributesOf(index)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  )
}

/** 強調の列のセルは、地を塗る印を先頭に持つ。 */
export function ColumnMarked(props: {
  readonly marked: boolean
  readonly children: ReactNode
}): ReactElement {
  return (
    <>
      {props.marked && (
        <span className={tableLeafClassNames.columnEmphasisMark} aria-hidden="true" />
      )}
      {props.children}
    </>
  )
}

/** 開け閉めの状態はこの部品が持つので、`row.key` は並べ替えで変わらない元の行の添字にする。 */
function BodyRow(props: {
  readonly row: LeafTableRow
  readonly attributesOf: (index: number) => object
  /** 表のどこかに詳しい中身のある行があるか。無い行の1列目を押しボタンの幅だけ寄せる。 */
  readonly spaced: boolean
}): ReactElement {
  const { row, attributesOf, spaced } = props
  const [open, setOpen] = useState(false)
  const { detail } = row
  return (
    <>
      <tr>
        {row.cells.map((cell, index) => (
          <td
            key={`${row.key}-${String(index)}`}
            {...attributesOf(index)}
            className={
              index === 0 && row.depth > 0
                ? tableLeafClassNames.tableDepths[row.depth - 1]
                : undefined
            }
          >
            {index === 0 && detail !== undefined && (
              <Button
                variant="ghost"
                size="label"
                pressed="none"
                disabled={false}
                ariaLabel={`${detail.label}の詳しい中身`}
                disclosure={{ kind: "expander", expanded: open }}
                className={styles["table-detail-toggle"]}
                onClick={() => {
                  setOpen(!open)
                }}
              >
                {open ? "▾" : "▸"}
              </Button>
            )}
            {index === 0 && spaced && detail === undefined && (
              <span className={styles["table-detail-spacer"]} aria-hidden="true" />
            )}
            {cell}
          </td>
        ))}
      </tr>
      {detail !== undefined && open && (
        <tr className={clsx(styles["table-detail-row"], tableLeafClassNames.tableDetailRow)}>
          <td colSpan={Math.max(1, row.cells.length)} className={styles["table-detail-cell"]}>
            {detail.content}
          </td>
        </tr>
      )}
    </>
  )
}
