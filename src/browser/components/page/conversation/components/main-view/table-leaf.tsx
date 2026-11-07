// `Table`（表）を Markdown に戻さず直接描く。
// 列の揃え・数の棒・状態の凡例・濃淡の段は全行から決め、札の色は内容部品の値から受ける。数えない。

import clsx from "clsx"
import { Fragment, type ReactElement, type ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { A2uiReportPart } from "../../../../../../shared/report/a2ui-report-outline.ts"
import {
  isEmphasisRow,
  type TableCell,
  tableRowCells,
  tableRowDepth,
  tableRowDetail,
} from "../../../../../../shared/report/report-block-comparison.ts"
import { flatInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import {
  CELL_STATUS_MARKS,
  type ColumnBar,
  heatLevelOf,
  isHeatColumn,
  isHeatPeak,
  numericCellMagnitude,
  type TableHeat,
  type TableTotals,
  tableHeatOf,
  tableLayoutOf,
} from "../../../../../../shared/report/table-layout.ts"
import { tableCellTexts } from "../../../../../../shared/report/table-view.ts"
import {
  InlineCodeText,
  InlineMarkdown,
  tableLeafClassNames,
  tagToneClassName,
} from "../../../../../features/report/markdown.tsx"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { visibleTableTotals } from "./domain/a2ui-table-view.ts"
import { ColumnMarked, LeafTable, type LeafTableRow } from "./leaf-table.tsx"
import styles from "./main-view.module.css"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type TablePart = A2uiReportPart<"Table">

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

/**
 * `rowOrder` は見せる行の元の添字を見せる順に並べたもの。
 * 棒・揃え・凡例・濃淡の段は見せない行も含めた全行から決め、合計は見せる行だけを足す。
 */
export function TableFigure(props: {
  readonly part: TablePart
  readonly value: LeafValue
  readonly rowOrder: readonly number[]
}): ReactElement {
  const { part, value, rowOrder } = props
  const layout = tableLayoutOf(part)
  const heat = tableHeatOf(part)
  const totals = visibleTableTotals(part, rowOrder)
  const totalled = totals.kind === "totals"
  return (
    <FoldedLeafFrame value={value} title={part.title} fit fold={part.fold} swap={false}>
      {layout.legendStatuses.length > 0 && (
        <div className={tableLeafClassNames.tableStatusLegend}>
          {layout.legendStatuses.map((status) => {
            const { symbol, label } = CELL_STATUS_MARKS[status]
            return (
              <span
                key={status}
                className={tableLeafClassNames.tableStatusLegendItem}
                aria-hidden="true"
              >
                <Badge tone={status} shape="square" className={styles["table-cell-badge"]}>
                  <span className={tableLeafClassNames.cellStatusMark}>{symbol}</span>
                  {` ${label}`}
                </Badge>
              </span>
            )
          })}
        </div>
      )}
      <LeafTable
        head={totalled ? [...headCells(part, value), TOTAL_LABEL] : headCells(part, value)}
        aligns={totalled ? [...layout.aligns, "right"] : layout.aligns}
        rows={bodyRows(part, { layout, heat, totals }, value, rowOrder)}
        foot={totals.kind === "totals" ? footRows(part.columns.length, heat, totals) : []}
      />
      {heat.kind === "heat" && <HeatLegend part={part} heat={heat} />}
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
    <ColumnMarked key={`${String(index)}:${column}`} marked={index === part.emphasisColumn}>
      <CellContent cell={column} bar={NO_BAR} statusColumn={false} value={value} />
    </ColumnMarked>
  ))
}

const TOTAL_LABEL = "計"

/** 合計の行。`heat` の範囲の列に列の合計、1列目に「計」、最後に総計を置き、ほかの列は空ける。 */
function footRows(
  columnCount: number,
  heat: TableHeat,
  totals: Extract<TableTotals, { readonly kind: "totals" }>,
): readonly (readonly ReactNode[])[] {
  if (heat.kind !== "heat") {
    return []
  }
  const cells = Array.from({ length: columnCount }, (_, column) => {
    if (isHeatColumn(heat, column)) {
      return <TotalValue key={column} text={totals.columns[column - heat.from] ?? ""} />
    }
    return column === 0 ? TOTAL_LABEL : ""
  })
  return [[...cells, <TotalValue key="grand" text={totals.grand} />]]
}

function TotalValue(props: { readonly text: string }): ReactElement {
  return <span className={tableLeafClassNames.tableTotal}>{props.text}</span>
}

function HeatLegend(props: {
  readonly part: TablePart
  readonly heat: Extract<TableHeat, { readonly kind: "heat" }>
}): ReactElement {
  const { part, heat } = props
  const peak = part.rows
    .flatMap((row) => tableRowCells(row).slice(heat.from, heat.to + 1))
    .find((cell) => isHeatPeak(heat, cell))
  return (
    <div className={tableLeafClassNames.heatLegend}>
      <span>少</span>
      {tableLeafClassNames.heatLevels.map((className) => (
        <span
          key={className}
          className={clsx(tableLeafClassNames.heatLegendSwatch, className)}
          aria-hidden="true"
        />
      ))}
      <span>多{typeof peak === "string" && `（最大 ${peak} に枠）`}</span>
    </div>
  )
}

type FigureLayout = {
  readonly layout: ReturnType<typeof tableLayoutOf>
  readonly heat: TableHeat
  readonly totals: TableTotals
}

function bodyRows(
  part: TablePart,
  figure: FigureLayout,
  value: LeafValue,
  rowOrder: readonly number[],
): readonly LeafTableRow[] {
  const { layout, heat, totals } = figure
  return rowOrder.flatMap((index, position) => {
    const row = part.rows[index]
    if (row === undefined) {
      return []
    }
    const drawn = tableRowCells(row).map((cell, column) => {
      const content = (
        <CellContent
          cell={cell}
          bar={layout.bars[column] ?? NO_BAR}
          statusColumn={layout.statusColumns[column] === true}
          value={value}
        />
      )
      return (
        <ColumnMarked
          key={`${String(column)}:${tableCellTexts(cell).join("|")}`}
          marked={column === part.emphasisColumn}
        >
          {heat.kind === "heat" && isHeatColumn(heat, column) ? (
            <span
              className={clsx(
                tableLeafClassNames.heatLevels[heatLevelOf(heat, cell)],
                isHeatPeak(heat, cell) && tableLeafClassNames.heatPeak,
              )}
            >
              {content}
            </span>
          ) : (
            content
          )}
        </ColumnMarked>
      )
    })
    const cells =
      totals.kind === "totals"
        ? [...drawn, <TotalValue key="total" text={totals.rows[position] ?? ""} />]
        : drawn
    const [first, ...rest] = cells
    const detail = tableRowDetail(row)
    return [
      {
        key: String(index),
        depth: tableRowDepth(row),
        detail:
          detail === undefined
            ? undefined
            : {
                label: tableCellTexts(tableRowCells(row)[0]).join(" "),
                content: <InlineMarkdown text={detail} />,
              },
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
        <span className={tableLeafClassNames.changeTo}>
          <ChangeTo text={cell.to} />
        </span>
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
    <Badge tone={cell.status} shape="square" className={styles["table-cell-badge"]}>
      <span className={tableLeafClassNames.cellStatusMark} role="img" aria-label={mark.label}>
        {mark.symbol}
      </span>
      <span className={tableLeafClassNames.cellStatusText}>
        <InlineMarkdown text={text === "" ? mark.label : text} />
      </span>
    </Badge>
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
