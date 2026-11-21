// 名前と値の組の並びを描く部品。中身は Astryx の `MetadataList` と `MetadataListItem`。

import {
  MetadataList as AstryxMetadataList,
  MetadataListItem as AstryxMetadataListItem,
} from "@astryxdesign/core/MetadataList"
import type { ReactElement, ReactNode } from "react"

export type MetadataListProps = {
  readonly title?: ReactNode
  readonly children: ReactNode
}

export function MetadataList(props: MetadataListProps): ReactElement {
  return (
    <AstryxMetadataList title={props.title} columns="single">
      {props.children}
    </AstryxMetadataList>
  )
}

export type MetadataListItemProps = {
  /** 名前。 */
  readonly label: string
  readonly children: ReactNode
}

export function MetadataListItem(props: MetadataListItemProps): ReactElement {
  return <AstryxMetadataListItem label={props.label}>{props.children}</AstryxMetadataListItem>
}
