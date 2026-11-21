// 項目の並び（印・ラベル・説明・右端）を描く部品。中身は Astryx の `List` と `ListItem`。
// 文字列のラベルは Astryx が1行で切るので、要素に包んで渡して折り返させる。

import { List as AstryxList, ListItem as AstryxListItem } from "@astryxdesign/core/List"
import type { ReactElement, ReactNode } from "react"

import styles from "./list.module.css"

export type ListProps = {
  /** 項目の間に仕切りを引くか。 */
  readonly hasDividers: boolean
  /** 番号を振るか（`ol`）、振らないか（`ul`）。 */
  readonly numbered: boolean
  readonly children: ReactNode
}

export function List(props: ListProps): ReactElement {
  return (
    <AstryxList
      density="compact"
      hasDividers={props.hasDividers}
      edge="flush"
      listStyle={props.numbered ? "decimal" : "none"}
    >
      {props.children}
    </AstryxList>
  )
}

export type ListItemProps = {
  /** 行頭の印。 */
  readonly mark?: ReactNode
  readonly label: ReactNode
  readonly description?: ReactNode
  /** 右端の置き物。 */
  readonly end?: ReactNode
}

export function ListItem(props: ListItemProps): ReactElement {
  return (
    <AstryxListItem
      startContent={props.mark}
      label={<span className={styles["label"]}>{props.label}</span>}
      description={
        props.description !== undefined && (
          <span className={styles["description"]}>{props.description}</span>
        )
      }
      endContent={props.end}
    />
  )
}
