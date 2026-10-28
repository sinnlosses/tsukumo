// `Table`（表）を Markdown に戻さず直接描く。
// 列の揃え・数の棒・状態の凡例は全行から決め、札の色は葉の値から受ける。数えない。

import clsx from "clsx"
import { Fragment, type ReactElement, type ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../../../../shared/report/a2ui-report-outline.ts"
import {
  isEmphasisRow,
  type TableCell,
  tableRowCells,
} from "../../../../../../shared/report/report-block-comparison.ts"
import { flatInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  CELL_STATUS_MARKS,
  type ColumnBar,
  numericCellMagnitude,
  tableLayoutOf,
} from "../../../../../../shared/report/table-layout.ts"
import { tableCellTexts } from "../../../../../../shared/report/table-view.ts"
import {
  InlineCodeText,
  InlineMarkdown,
  tableLeafClassNames,
  tagToneClassName,
} from "../markdown/markdown.tsx"
import { LeafTable, type LeafTableRow } from "./leaf-table.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type TablePart = A2uiReportPart<"Table">

const STATUS_CLASS_NAMES = {
  ok: tableLeafClassNames.cellStatusOk,
  warn: tableLeafClassNames.cellStatusWarn,
  ng: tableLeafClassNames.cellStatusNg,
} as const satisfies Record<keyof typeof CELL_STATUS_MARKS, string>

const NO_BAR: ColumnBar = { kind: "none" }

export function TableLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Table") {
    return <></>
  }
  return <TableFigure part={part} value={value} rowOrder={part.rows.map((_, index) => index)} />
}

/** `rowOrder` は見せる行の元の添字を見せる順に並べたもの。棒・揃え・凡例は見せない行も含めた全行から決める。 */
export function TableFigure(props: {
  readonly part: TablePart
  readonly value: LeafValue
  readonly rowOrder: readonly number[]
}): ReactElement {
  const { part, value, rowOrder } = props
  const layout = tableLayoutOf(part)
  return (
    <FoldedLeafFrame value={value} title={part.title} fit fold={part.fold} swap={false}>
      {layout.legendStatuses.length > 0 && (
        <div className={tableLeafClassNames.tableStatusLegend}>
          {layout.legendStatuses.map((status) => {
            const { symbol, label } = CELL_STATUS_MARKS[status]
            return (
              <span key={status} className={tableLeafClassNames.tableStatusLegendItem}>
                <span
                  className={clsx(
                    tableLeafClassNames.tableStatusLegendSwatch,
                    STATUS_CLASS_NAMES[status],
                  )}
                  aria-hidden="true"
                />
                <span
                  className={clsx(tableLeafClassNames.cellStatusMark, STATUS_CLASS_NAMES[status])}
                  aria-hidden="true"
                >
                  {symbol}
                </span>
                {` ${label}`}
              </span>
            )
          })}
        </div>
      )}
      <LeafTable
        head={headCells(part, value)}
        aligns={layout.aligns}
        rows={bodyRows(part, layout, value, rowOrder)}
      />
      {part.rest.trim() !== "" && (
        <div className={tableLeafClassNames.tableRest}>
          <InlineCodeText text={part.rest} />
        </div>
      )}
    </FoldedLeafFrame>
  )
}

function headCells(part: TablePart, value: LeafValue): readonly ReactNode[] {
  return part.columns.map((column, index) => (
    <CellContent
      key={`${String(index)}:${column}`}
      cell={column}
      bar={NO_BAR}
      statusColumn={false}
      value={value}
    />
  ))
}

function bodyRows(
  part: TablePart,
  layout: ReturnType<typeof tableLayoutOf>,
  value: LeafValue,
  rowOrder: readonly number[],
): readonly LeafTableRow[] {
  return rowOrder.flatMap((index) => {
    const row = part.rows[index]
    if (row === undefined) {
      return []
    }
    const cells = tableRowCells(row).map((cell, column) => (
      <CellContent
        key={`${String(column)}:${tableCellTexts(cell).join("|")}`}
        cell={cell}
        bar={layout.bars[column] ?? NO_BAR}
        statusColumn={layout.statusColumns[column] === true}
        value={value}
      />
    ))
    const [first, ...rest] = cells
    return [
      {
        key: String(index),
        cells:
          isEmphasisRow(row) && first !== undefined
            ? [
                <Fragment key="emphasis">
                  <span className={tableLeafClassNames.rowEmphasisMark} aria-hidden="true" />
                  {first}
                </Fragment>,
                ...rest,
              ]
            : cells,
      },
    ]
  })
}

function CellContent(props: {
  readonly cell: TableCell
  readonly bar: ColumnBar
  readonly statusColumn: boolean
  readonly value: Pick<LeafValue, "tagTones">
}): ReactElement {
  const { cell, bar, statusColumn, value } = props
  if (typeof cell === "string") {
    if (statusColumn) {
      return (
        <span className={tableLeafClassNames.cellStatusNone}>
          <InlineMarkdown text={cell} />
        </span>
      )
    }
    return bar.kind === "bar" ? (
      <span className={tableLeafClassNames.cellNumeric}>
        <span
          className={tableLeafClassNames.cellBar}
          style={{ width: `${String(Math.round((numericCellMagnitude(cell) / bar.max) * 100))}%` }}
        />
        <span className={tableLeafClassNames.cellNumericValue}>
          <InlineMarkdown text={cell} />
        </span>
      </span>
    ) : (
      <InlineMarkdown text={cell} />
    )
  }
  if ("from" in cell) {
    return (
      <>
        <span className={tableLeafClassNames.changeFrom}>
          <InlineMarkdown text={`${flatInline(cell.from)} →`} />
        </span>
        <ChangeTo text={cell.to} />
      </>
    )
  }
  if ("tag" in cell) {
    return (
      <span
        className={clsx(
          tableLeafClassNames.tag,
          tagToneClassName(value.tagTones[cell.tag] ?? "tag-none"),
        )}
      >
        <InlineMarkdown text={cell.tag} />
      </span>
    )
  }
  const mark = CELL_STATUS_MARKS[cell.status]
  const text = cell.text.trim()
  return (
    <span className={clsx(tableLeafClassNames.cellStatus, STATUS_CLASS_NAMES[cell.status])}>
      <span
        className={clsx(tableLeafClassNames.cellStatusMark, STATUS_CLASS_NAMES[cell.status])}
        role="img"
        aria-label={mark.label}
      >
        {mark.symbol}
      </span>
      <span className={tableLeafClassNames.cellStatusText}>
        <InlineMarkdown text={text === "" ? mark.label : text} />
      </span>
    </span>
  )
}

const MARKDOWN_SYNTAX = /[*_`~[\]<>&\\!|]/

/** 記法の無い字は「空白＋字」を1つの text ノードにする（割れると字の送りが半画素ずれる）。 */
function ChangeTo(props: { readonly text: string }): ReactElement {
  if (MARKDOWN_SYNTAX.test(props.text)) {
    return (
      <>
        {" "}
        <InlineMarkdown text={flatInline(props.text)} />
      </>
    )
  }
  return <>{` ${flatInline(props.text)}`}</>
}
