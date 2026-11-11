// 表と対応表を直接描く部品が共有する表の骨組み。
// 横スクロールの器・見出しの行・10 行で切る本体を、旧い Markdown の表と同じ要素で返す。

import clsx from "clsx"
import { type ReactElement, type ReactNode, useState } from "react"

import type { ColumnAlign } from "../../../../shared/report/table-layout.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import {
  Table,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../components/ui/table/table.tsx"
import { FoldedTableBody, tableLeafClassNames } from "../markdown.tsx"
import styles from "./leaf.module.css"

export type LeafTableAlign = ColumnAlign | "center"

export type LeafTableRow = {
  readonly key: string
  readonly cells: readonly ReactNode[]
  /** 開け閉めの印を出す行の詳しい中身。`label` は押しボタンの名前に使う行の名前。 */
  readonly detail?: { readonly label: string; readonly content: ReactNode }
  /** 1列目の字下げの段（0 は寄せない）。 */
  readonly depth: number
  /** 押すと指せる行。`index` は書いた並びの添字、`label` は1列目の字、`active` はこの行について入力欄を開いているか。 */
  readonly unit?: {
    readonly index: number
    readonly label: string
    readonly pointed: boolean
    /** 部品の中の Tab の止まり場なら 0、ほかは -1。 */
    readonly tabIndex: 0 | -1
    readonly active: boolean
    /** この行について聞いたことがあるか（行の左に印の線を付ける）。 */
    readonly asked: boolean
  }
}

type LeafTableProps = {
  readonly head: readonly ReactNode[]
  readonly aligns: readonly LeafTableAlign[]
  readonly rows: readonly LeafTableRow[]
  /** 本体の 10 行の切りに入らない末尾の行（合計の行・値の行）。空なら `tfoot` を出さない。 */
  readonly foot: readonly (readonly ReactNode[])[]
  /** 見出しのセルごとの `aria-sort`。渡さないと付けない。 */
  readonly headSorts?: readonly HeadSort[]
}

export type HeadSort = "ascending" | "descending" | "none"

/** 行が 0 件なら本体を出さない。 */
export function LeafTable(props: LeafTableProps): ReactElement {
  const alignOf = (index: number): LeafTableAlign => props.aligns[index] ?? "left"
  return (
    <div className={tableLeafClassNames.tableScroll}>
      <Table>
        <TableHead>
          <TableRow className="" header>
            {props.head.map((cell, index) => (
              <TableHeaderCell
                key={`head-${String(index)}`}
                align={alignOf(index)}
                sort={props.headSorts?.[index] ?? "unspecified"}
                hidden={false}
              >
                {cell}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        {props.rows.length > 0 && (
          <FoldedTableBody
            ui
            bodyProps={{}}
            columnCount={Math.max(1, ...props.rows.map((row) => row.cells.length))}
          >
            {props.rows.map((row) => (
              <BodyRow
                key={row.key}
                row={row}
                alignOf={alignOf}
                spaced={props.rows.some((other) => other.detail !== undefined)}
              />
            ))}
          </FoldedTableBody>
        )}
        {props.foot.length > 0 && (
          <TableFoot>
            {props.foot.map((cells, rowIndex) => (
              <TableRow key={`foot-${String(rowIndex)}`} className="" header={false}>
                {cells.map((cell, index) => (
                  <TableCell
                    key={`foot-${String(rowIndex)}-${String(index)}`}
                    align={alignOf(index)}
                    className=""
                    hidden={false}
                    span={1}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableFoot>
        )}
      </Table>
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
  readonly alignOf: (index: number) => LeafTableAlign
  /** 表のどこかに詳しい中身のある行があるか。無い行の1列目を押しボタンの幅だけ寄せる。 */
  readonly spaced: boolean
}): ReactElement {
  const { row, alignOf, spaced } = props
  const [open, setOpen] = useState(false)
  const { detail, unit } = row
  return (
    <>
      <TableRow
        header={false}
        className={clsx(
          unit !== undefined && styles["reply-unit"],
          unit?.active === true && styles["ask-row-active"],
          unit?.asked === true && styles["ask-row-asked"],
        )}
        {...(unit !== undefined && { point: unit })}
      >
        {row.cells.map((cell, index) => (
          <TableCell
            key={`${row.key}-${String(index)}`}
            align={alignOf(index)}
            hidden={false}
            span={1}
            className={
              index === 0 && row.depth > 0
                ? (tableLeafClassNames.tableDepths[row.depth - 1] ?? "")
                : ""
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
          </TableCell>
        ))}
      </TableRow>
      {detail !== undefined && open && (
        <TableRow
          header={false}
          className={clsx(styles["table-detail-row"], tableLeafClassNames.tableDetailRow)}
        >
          <TableCell
            align="left"
            hidden={false}
            span={Math.max(1, row.cells.length)}
            className={styles["table-detail-cell"] ?? ""}
          >
            {detail.content}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
