// 切り替えのタブの並びを描く部品。中身は Astryx の `TabList`（`role="tablist"`・`role="tab"`・`aria-selected`・`aria-controls`）。
// 選んだ値は `tabs` から引いて `T` で返す。

import { Tab, TabList as AstryxTabList } from "@astryxdesign/core/TabList"
import type { ReactElement, ReactNode } from "react"

type TabItem<T extends string> = {
  readonly value: T
  readonly label: string
  /** タブ自身の `id`（パネルの `aria-labelledby` が指す）。 */
  readonly id: string
  readonly endContent?: ReactNode
}

type TabListProps<T extends string> = {
  readonly label: string
  readonly value: T
  readonly tabs: readonly TabItem<T>[]
  /** タブが操作するパネルの `id`（`aria-controls`）。 */
  readonly panelId: string
  readonly onChange: (value: T) => void
}

export function TabList<T extends string>(props: TabListProps<T>): ReactElement {
  return (
    <AstryxTabList
      role="tablist"
      layout="fill"
      aria-label={props.label}
      value={props.value}
      onChange={(next) => {
        const tab = props.tabs.find((candidate) => candidate.value === next)
        if (tab !== undefined) props.onChange(tab.value)
      }}
    >
      {props.tabs.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          label={tab.label}
          id={tab.id}
          panelId={props.panelId}
          {...(tab.endContent === undefined ? {} : { endContent: tab.endContent })}
        />
      ))}
    </AstryxTabList>
  )
}
