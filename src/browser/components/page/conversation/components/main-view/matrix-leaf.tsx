// `Matrix`（行×列の交点が状態だけの対応表）を Markdown に戻さず直接描く。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  MATRIX_MARKS,
  type MatrixStatus,
  matrixLegendStatuses,
} from "../../../../../../shared/report/table-layout.ts"
import { InlineMarkdown, matrixLeafClassNames } from "../markdown/markdown.tsx"
import { LeafTable, type LeafTableRow } from "./leaf-table.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

const MARK_CLASS_NAMES = {
  ok: matrixLeafClassNames.matrixMarkOk,
  warn: matrixLeafClassNames.matrixMarkWarn,
  ng: matrixLeafClassNames.matrixMarkNg,
  na: matrixLeafClassNames.matrixMarkNa,
} as const satisfies Record<MatrixStatus, string>

export function MatrixLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Matrix") {
    return <></>
  }
  return (
    <FoldedLeafFrame value={value} title={part.title} fit fold={part.fold} swap={false}>
      <div className={matrixLeafClassNames.matrix}>
        <LeafTable
          head={headCells(part.columns)}
          aligns={["left", ...part.columns.map(() => "center" as const)]}
          rows={bodyRows(part.rows)}
        />
        <div className={matrixLeafClassNames.matrixLegend}>
          {matrixLegendStatuses(part).map((status) => (
            <span key={status} className={matrixLeafClassNames.matrixLegendItem}>
              <MatrixMark status={status} legend />
              {` ${MATRIX_MARKS[status].label}`}
            </span>
          ))}
        </div>
      </div>
    </FoldedLeafFrame>
  )
}

type MatrixPart = Extract<A2uiReportComponent, { readonly component: "Matrix" }>

function headCells(columns: MatrixPart["columns"]): readonly ReactNode[] {
  return [
    "",
    ...columns.map((column, index) => (
      <InlineMarkdown key={`${String(index)}:${column}`} text={column} />
    )),
  ]
}

function bodyRows(rows: MatrixPart["rows"]): readonly LeafTableRow[] {
  return rows.map((row, rowIndex) => ({
    key: `${String(rowIndex)}:${row.name}`,
    cells: [
      <InlineMarkdown key="name" text={row.name} />,
      ...row.cells.map((status, index) => (
        <MatrixMark key={`${String(index)}:${status}`} status={status} legend={false} />
      )),
    ],
  }))
}

/** 交点の印は `role="img"` と状態の語の `aria-label` を持つ。凡例の印は飾りで隠す。 */
function MatrixMark(props: {
  readonly status: MatrixStatus
  readonly legend: boolean
}): ReactElement {
  const { symbol, label } = MATRIX_MARKS[props.status]
  const className = clsx(matrixLeafClassNames.matrixMark, MARK_CLASS_NAMES[props.status])
  return props.legend ? (
    <span className={className} aria-hidden="true">
      {symbol}
    </span>
  ) : (
    <span className={className} role="img" aria-label={label}>
      {symbol}
    </span>
  )
}
