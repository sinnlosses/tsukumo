// 表と対応表を直接描く部品が共有する表の骨組み。
// 横スクロールの器・見出しの行・10 行で切る本体を、旧い Markdown の表と同じ要素で返す。

import type { ReactElement, ReactNode } from "react"

import type { ColumnAlign } from "../../../../../../shared/report/table-layout.ts"
import { FoldedTableBody, tableLeafClassNames } from "../markdown/markdown.tsx"

export type LeafTableAlign = ColumnAlign | "center"

export type LeafTableRow = {
  readonly key: string
  readonly cells: readonly ReactNode[]
}

type LeafTableProps = {
  readonly head: readonly ReactNode[]
  readonly aligns: readonly LeafTableAlign[]
  readonly rows: readonly LeafTableRow[]
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
              <tr key={row.key}>
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${String(index)}`} {...attributesOf(index)}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </FoldedTableBody>
        )}
      </table>
    </div>
  )
}
