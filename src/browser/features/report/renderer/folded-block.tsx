// 長い表（本体の行）と一覧を 10 件で切る、hast の `tbody` / `ul` / `ol` の上書き。
// 地の文の `ul` / `ol` は `ui/` の List で描く。
// 脚注の節の `ol` と、class を持つ記法の `ul` / `ol` は切らない。本文の文字列は変えない。

import type { Element } from "hast"
import type { JSX, ReactElement } from "react"
import type { ExtraProps } from "react-markdown"

import { optionalString } from "../../../../shared/utils/optional-string.ts"
import { FoldedList, FoldedTableBody } from "./long-block-fold.tsx"
import { NotationOrderedList } from "./notation.tsx"
import { NativeListScope, ProseList, useProseListPlacement } from "./prose-list.tsx"

type TableBodyProps = JSX.IntrinsicElements["tbody"] & ExtraProps

/** 表の本体。行が 10 を超えたら 10 行で切り、残りは「ほか n 件」を押すと出す（{@link FoldedTableBody}）。 */
export function TableBody(props: TableBodyProps): ReactElement {
  const { node, children, ...rest } = props
  return (
    <FoldedTableBody bodyProps={rest} columnCount={node === undefined ? 1 : tableColumnCount(node)}>
      {children}
    </FoldedTableBody>
  )
}

type UnorderedListProps = JSX.IntrinsicElements["ul"] & ExtraProps

/**
 * 記法の class を持たない `ul` は、10 項目を超えたら 10 項目で切る。class を持つもの（記法の並び）はそのまま描く。
 * 切る `ul` は、地の文なら List（{@link ProseList}）、記法の容れ物の中なら素の `ul` で描く。
 */
export function UnorderedList(props: UnorderedListProps): ReactElement {
  const { node: _node, children, ...rest } = props
  const prose = useProseListPlacement()
  if (rest.className !== undefined) {
    return (
      <NativeListScope>
        <ul {...rest}>{children}</ul>
      </NativeListScope>
    )
  }
  return (
    <FoldedList
      renderList={(items) =>
        prose ? (
          <ProseList numbered={false}>{items}</ProseList>
        ) : (
          <NativeListScope>
            <ul {...rest}>{items}</ul>
          </NativeListScope>
        )
      }
    >
      {children}
    </FoldedList>
  )
}

type OrderedListProps = JSX.IntrinsicElements["ol"] & ExtraProps

/**
 * 記法の class を持たない `ol` は 10 項目で切る。脚注の節の `ol` と class を持つ `ol`（段の並びなど）は切らない。
 * 切る `ol` は、地の文なら List（{@link ProseList}）、記法の容れ物の中なら素の `ol` で描く。
 * 脚注の `ol` を List にしないのは、項目の `id` が参照元からの飛び先で、ListItem が `id` を描かないため。
 */
export function OrderedList(props: OrderedListProps): ReactElement {
  const { node } = props
  const prose = useProseListPlacement()
  if (props.className !== undefined || (node !== undefined && isFootnoteList(node))) {
    return (
      <NativeListScope>
        <NotationOrderedList {...props} />
      </NativeListScope>
    )
  }
  const { node: _node, children, ...rest } = props
  return (
    <FoldedList
      renderList={(items) =>
        prose ? (
          <ProseList numbered={true}>{items}</ProseList>
        ) : (
          <NativeListScope>
            <ol {...rest}>{items}</ol>
          </NativeListScope>
        )
      }
    >
      {children}
    </FoldedList>
  )
}

/** 本体の行のうち最も広い行のセル数。「ほか n 件」の行をその幅に渡す。 */
function tableColumnCount(body: Element): number {
  const cellCounts = body.children.map((row) =>
    row.type === "element" ? row.children.filter((cell) => cell.type === "element").length : 0,
  )
  return Math.max(1, ...cellCounts)
}

/** 脚注の節の一覧か（項目の `id` が `fn-` で始まる。サニタイズが `user-content-` を前置する）。 */
function isFootnoteList(list: Element): boolean {
  return list.children.some(
    (item) =>
      item.type === "element" &&
      /^(user-content-)?fn-/.test(optionalString(item.properties.id) ?? ""),
  )
}
