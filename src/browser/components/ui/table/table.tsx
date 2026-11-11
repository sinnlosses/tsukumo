// 子を直に書く表の部品。中身は Astryx の `Table`・`TableHeader`・`TableBody`・`TableFooter`・
// `TableRow`・`TableHeaderCell`・`TableCell`。見た目に関わる props（密度・罫の形）は部品の中で決める。
// 置き方（margin・字下げなど）は呼び出し側が `className` で渡す。

import {
  Table as AstryxTable,
  TableBody as AstryxTableBody,
  TableCell as AstryxTableCell,
  TableFooter as AstryxTableFooter,
  TableHeader as AstryxTableHeader,
  TableHeaderCell as AstryxTableHeaderCell,
  TableRow as AstryxTableRow,
} from "@astryxdesign/core/Table"
import type { ReactElement, ReactNode } from "react"

export type TableAlign = "left" | "right" | "center"
export type TableSort = "ascending" | "descending" | "none" | "unspecified"

/** Astryx のセルは `max-width: 0` と `overflow: hidden` で列幅を表の幅の等分にするので、列幅を内容の幅にする。 */
const CELL_STYLE = { maxWidth: "none", overflow: "visible" } as const

const ALIGN_STYLE = {
  left: CELL_STYLE,
  right: { ...CELL_STYLE, textAlign: "right" },
  center: { ...CELL_STYLE, textAlign: "center" },
} as const satisfies Record<TableAlign, object>

/** Astryx の Table は `width: 100%` で、内容の幅に縮む器の中では最小幅まで潰れるので、内容の幅にする。 */
const FIT_CONTENT = { width: "auto" } as const

export type TableProps = {
  readonly children: ReactNode
}

export function Table(props: TableProps): ReactElement {
  return (
    <AstryxTable density="compact" dividers="rows" scrollWrapper={PassThrough} style={FIT_CONTENT}>
      {props.children}
    </AstryxTable>
  )
}

export type TableSectionProps = {
  readonly children: ReactNode
}

export function TableHead(props: TableSectionProps): ReactElement {
  return <AstryxTableHeader>{props.children}</AstryxTableHeader>
}

export function TableRows(props: TableSectionProps): ReactElement {
  return <AstryxTableBody>{props.children}</AstryxTableBody>
}

export function TableFoot(props: TableSectionProps): ReactElement {
  return <AstryxTableFooter>{props.children}</AstryxTableFooter>
}

export type TableRowProps = {
  readonly className: string
  /** 先頭の行（見出しの行）か。 */
  readonly header: boolean
  /** 押して指せる行の印。レポートの余白の口が `data-reply-*` を読んで指す行を決める。 */
  readonly point?: TableRowPoint
  readonly children: ReactNode
}

export type TableRowPoint = {
  /** 書いた並びの添字。 */
  readonly index: number
  /** 1列目の字。 */
  readonly label: string
  readonly pointed: boolean
  /** 部品の中の Tab の止まり場なら 0、ほかは -1。 */
  readonly tabIndex: 0 | -1
}

export function TableRow(props: TableRowProps): ReactElement {
  const { point } = props
  return (
    <AstryxTableRow
      isHeaderRow={props.header}
      className={props.className === "" ? undefined : props.className}
      data-reply-unit={point === undefined ? undefined : "row"}
      data-reply-row={point?.index}
      data-reply-label={point?.label}
      data-pointed={point?.pointed === true ? "" : undefined}
      tabIndex={point?.tabIndex}
    >
      {props.children}
    </AstryxTableRow>
  )
}

export type TableHeaderCellProps = {
  readonly align: TableAlign
  readonly sort: TableSort
  /** 支援技術に見せない空の列か。 */
  readonly hidden: boolean
  readonly children: ReactNode
}

export function TableHeaderCell(props: TableHeaderCellProps): ReactElement {
  return (
    <AstryxTableHeaderCell
      style={ALIGN_STYLE[props.align]}
      aria-sort={props.sort === "unspecified" ? undefined : props.sort}
      aria-hidden={props.hidden ? true : undefined}
    >
      {props.children}
    </AstryxTableHeaderCell>
  )
}

export type TableCellProps = {
  readonly align: TableAlign
  readonly className: string
  /** 支援技術に見せない空の列か。 */
  readonly hidden: boolean
  /** 横に渡る列数。渡らないなら 1。 */
  readonly span: number
  readonly children: ReactNode
}

export function TableCell(props: TableCellProps): ReactElement {
  return (
    <AstryxTableCell
      style={ALIGN_STYLE[props.align]}
      className={props.className === "" ? undefined : props.className}
      aria-hidden={props.hidden ? true : undefined}
      colSpan={props.span === 1 ? undefined : props.span}
    >
      {props.children}
    </AstryxTableCell>
  )
}

/** Astryx の横スクロールの器（名前つきの group）は出さない。横に転がす器は呼び出し側が持つ。 */
function PassThrough(props: { readonly children: ReactNode }): ReactElement {
  return <>{props.children}</>
}
