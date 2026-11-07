// `Matrix`（行×列の交点が状態の印の対応表）を Markdown に戻さず直接描く。

import type { ReactElement, ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import {
  MATRIX_MARKS,
  type MatrixStatus,
  matrixCellOf,
  matrixLegendStatuses,
} from "../../../../shared/report/table-layout.ts"
import { Badge } from "../../../components/ui/badge/badge.tsx"
import { InlineMarkdown, matrixLeafClassNames } from "../markdown.tsx"
import { ColumnMarked, LeafTable, type LeafTableRow } from "./leaf-table.tsx"
import styles from "./leaf.module.css"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

const BADGE_TONES = {
  ok: "ok",
  warn: "warn",
  ng: "ng",
  na: "neutral",
} as const satisfies Record<MatrixStatus, "ok" | "warn" | "ng" | "neutral">

const EMPHASIS_BADGE = "推奨"

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
          head={headCells(part)}
          aligns={["left", ...part.columns.map(() => "center" as const)]}
          rows={bodyRows(part)}
          foot={footRows(part)}
        />
        <div className={matrixLeafClassNames.matrixLegend}>
          {matrixLegendStatuses(part).map((status) => (
            <span key={status} className={matrixLeafClassNames.matrixLegendItem}>
              <MatrixMark status={status} note="" legend />
              {` ${MATRIX_MARKS[status].label}`}
            </span>
          ))}
        </div>
      </div>
    </FoldedLeafFrame>
  )
}

type MatrixPart = Extract<A2uiReportComponent, { readonly component: "Matrix" }>

function headCells(part: MatrixPart): readonly ReactNode[] {
  return [
    "",
    ...part.columns.map((column, index) => (
      <ColumnMarked key={`${String(index)}:${column}`} marked={index === part.emphasisColumn}>
        <InlineMarkdown text={column} />
        {index === part.emphasisColumn && (
          <Badge tone="accent" shape="square" className={styles["matrix-emphasis-badge"]}>
            {EMPHASIS_BADGE}
          </Badge>
        )}
      </ColumnMarked>
    )),
  ]
}

function bodyRows(part: MatrixPart): readonly LeafTableRow[] {
  return part.rows.map((row, rowIndex) => ({
    key: `${String(rowIndex)}:${row.name}`,
    cells: [
      <InlineMarkdown key="name" text={row.name} />,
      ...row.cells.map((cell, index) => {
        const { status, note } = matrixCellOf(cell)
        return (
          <ColumnMarked key={`${String(index)}:${status}`} marked={index === part.emphasisColumn}>
            <MatrixMark status={status} note={note} legend={false} />
            {note !== "" && (
              <span className={matrixLeafClassNames.matrixNote} aria-hidden="true">
                {note}
              </span>
            )}
          </ColumnMarked>
        )
      }),
    ],
    detail: undefined,
    depth: 0,
  }))
}

function footRows(part: MatrixPart): readonly (readonly ReactNode[])[] {
  return (part.footer ?? []).map((row) => [
    <InlineMarkdown key="name" text={row.name} />,
    ...row.cells.map((cell, index) => (
      <ColumnMarked key={`${String(index)}:${cell}`} marked={index === part.emphasisColumn}>
        <InlineMarkdown text={cell} />
      </ColumnMarked>
    )),
  ])
}

/** 交点の印は `role="img"` と状態の語（補足があれば括弧で添える）の `aria-label` を持つ。凡例の印は飾りで隠す。 */
function MatrixMark(props: {
  readonly status: MatrixStatus
  readonly note: string
  readonly legend: boolean
}): ReactElement {
  const { symbol, label } = MATRIX_MARKS[props.status]
  const badge = (
    <Badge tone={BADGE_TONES[props.status]} shape="square" className={styles["matrix-mark-badge"]}>
      {symbol}
    </Badge>
  )
  return props.legend ? (
    <span aria-hidden="true">{badge}</span>
  ) : (
    <span role="img" aria-label={props.note === "" ? label : `${label}（${props.note}）`}>
      {badge}
    </span>
  )
}
