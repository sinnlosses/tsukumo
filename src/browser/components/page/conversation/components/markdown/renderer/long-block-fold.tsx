// 長い表・一覧を FOLD_LIMIT 件で切り、残りは「ほか n 件」を押すと出す部品。
// 本文の Markdown は変えず、描く側だけで畳む（全文は押せば読める）。
//
// 表は `tbody` の上書き、一覧は `ul` / `ol` の上書きから使う。
// 項目の数え方は、描かれた子の要素（行・`li`）。要素と要素の間の改行の文字は数えない。

import { Children, isValidElement, useState } from "react"
import type { JSX, ReactElement, ReactNode } from "react"

import { Button } from "../../../../../ui/button/button.tsx"
import styles from "./report-notation.module.css"

/** 切らずに全部出す件数の上限。これを超えたら、この件数で切る。 */
const FOLD_LIMIT = 10

export type FoldedTableBodyProps = {
  readonly bodyProps: JSX.IntrinsicElements["tbody"]
  /** 「ほか n 件」の行が横に渡る列数。 */
  readonly columnCount: number
  readonly children: ReactNode
}

/** 本体の行が FOLD_LIMIT を超える表の `tbody`。 */
export function FoldedTableBody(props: FoldedTableBodyProps): ReactElement {
  const { items, hiddenCount, expand } = useFoldedItems(props.children)
  return (
    <tbody {...props.bodyProps}>
      {items}
      {hiddenCount > 0 && (
        <tr className={styles["report-fold-more"]}>
          <td colSpan={props.columnCount}>
            <MoreButton hiddenCount={hiddenCount} onClick={expand} />
          </td>
        </tr>
      )}
    </tbody>
  )
}

export type FoldedListProps = {
  /** 項目を受け取って `ul` / `ol` の器に入れる。 */
  readonly renderList: (items: ReactNode) => ReactElement
  readonly children: ReactNode
}

/** 項目が FOLD_LIMIT を超える一覧（`ul` / `ol`）。 */
export function FoldedList(props: FoldedListProps): ReactElement {
  const { items, hiddenCount, expand } = useFoldedItems(props.children)
  return props.renderList(
    <>
      {items}
      {hiddenCount > 0 && (
        <li className={styles["report-fold-more"]}>
          <MoreButton hiddenCount={hiddenCount} onClick={expand} />
        </li>
      )}
    </>,
  )
}

/** 項目の並び（`children`）を、上限で切った並びと「ほか n 件」の口に分ける。 */
function useFoldedItems(children: ReactNode): {
  readonly items: readonly ReactNode[]
  readonly hiddenCount: number
  readonly expand: () => void
} {
  const [expanded, setExpanded] = useState(false)
  const all = Children.toArray(children).filter((child) => isValidElement(child))
  const folded = !expanded && all.length > FOLD_LIMIT
  return {
    items: folded ? all.slice(0, FOLD_LIMIT) : all,
    hiddenCount: folded ? all.length - FOLD_LIMIT : 0,
    expand: () => {
      setExpanded(true)
    },
  }
}

function MoreButton(props: {
  readonly hiddenCount: number
  readonly onClick: () => void
}): ReactElement {
  return (
    <Button
      variant="link"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "none" }}
      className={styles["report-fold-more-button"]}
      onClick={props.onClick}
    >
      {`ほか ${props.hiddenCount} 件`}
    </Button>
  )
}
