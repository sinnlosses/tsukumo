// 長い表（本体の行）と一覧を 10 件で切る、hast の `tbody` / `ul` / `ol` の上書き。
// 脚注の節の `ol` と、class を持つ記法の `ul` / `ol` は切らない。本文の文字列は変えない。

import type { Element } from "hast"
import type { JSX, ReactElement } from "react"
import type { ExtraProps } from "react-markdown"

import { optionalString } from "../../../../../../../shared/utils/optional-string.ts"
import { FoldedList, FoldedTableBody } from "./long-block-fold.tsx"
import { NotationOrderedList } from "./notation.tsx"

type TableBodyProps = JSX.IntrinsicElements["tbody"] & ExtraProps

/** 表の本体。行が 10 を超えたら 10 行で切り、残りは「ほか n 件」を押すと出す（{@link FoldedTableBody}）。 */
export function TableBody(props: TableBodyProps): ReactElement {
  const { node, children, ...rest } = props
  return (
    <FoldedTableBody bodyProps={rest} columnCount={tableColumnCount(node)}>
      {children}
    </FoldedTableBody>
  )
}

type UnorderedListProps = JSX.IntrinsicElements["ul"] & ExtraProps

/** 記法の class を持たない `ul` は、10 項目を超えたら 10 項目で切る。class を持つもの（チェックリストなど）はそのまま描く。 */
export function UnorderedList(props: UnorderedListProps): ReactElement {
  const { node: _node, children, ...rest } = props
  if (rest.className !== undefined) {
    return <ul {...rest}>{children}</ul>
  }
  return <FoldedList renderList={(items) => <ul {...rest}>{items}</ul>}>{children}</FoldedList>
}

type OrderedListProps = JSX.IntrinsicElements["ol"] & ExtraProps

/** 記法の class を持たない `ol` は 10 項目で切る。脚注の節の `ol` と class を持つ `ol`（段の並びなど）は切らない。 */
export function OrderedList(props: OrderedListProps): ReactElement {
  const { node } = props
  if (props.className !== undefined || isFootnoteList(node)) {
    return <NotationOrderedList {...props} />
  }
  const { node: _node, children, ...rest } = props
  return <FoldedList renderList={(items) => <ol {...rest}>{items}</ol>}>{children}</FoldedList>
}

/** 本体の行のうち最も広い行のセル数。「ほか n 件」の行をその幅に渡す。 */
function tableColumnCount(body: Element | undefined): number {
  const cellCounts = (body?.children ?? []).map((row) =>
    row.type === "element" ? row.children.filter((cell) => cell.type === "element").length : 0,
  )
  return Math.max(1, ...cellCounts)
}

/** 脚注の節の一覧か（項目の `id` が `fn-` で始まる。サニタイズが `user-content-` を前置する）。 */
function isFootnoteList(list: Element | undefined): boolean {
  return (list?.children ?? []).some(
    (item) =>
      item.type === "element" &&
      /^(user-content-)?fn-/.test(optionalString(item.properties.id) ?? ""),
  )
}
