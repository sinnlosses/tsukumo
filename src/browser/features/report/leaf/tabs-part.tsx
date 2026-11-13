// 配置の部品 `Tabs`。題の並び（`role="tablist"`）と、全部の子を同じ格子の1つの区画に重ねた中身を描く。
// 選んでいない子は `visibility: hidden` で DOM に残し、区画の高さを最も高い子に合わせて、切り替えても紙が跳ねないようにする。

import { type ReactElement, type ReactNode, useId, useState } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import styles from "./leaf.module.css"

export function TabsPart(props: {
  readonly tabs: Extract<A2uiReportComponent, { readonly component: "Tabs" }>["tabs"]
  readonly renderChild: (child: string) => ReactNode
}): ReactElement {
  const [selected, setSelected] = useState(0)
  const idPrefix = useId()
  return (
    <div>
      <div role="tablist" className={styles["tabs-list"]}>
        {props.tabs.map((tab, index) => (
          <button
            type="button"
            key={tab.child}
            id={`${idPrefix}-tab-${String(index)}`}
            role="tab"
            className={styles["tabs-tab"]}
            aria-selected={index === selected}
            aria-controls={`${idPrefix}-panel-${String(index)}`}
            onClick={() => {
              setSelected(index)
            }}
          >
            {typeof tab.title === "string" ? tab.title : ""}
          </button>
        ))}
      </div>
      <div className={styles["tabs-stack"]}>
        {props.tabs.map((tab, index) => (
          <div
            key={tab.child}
            id={`${idPrefix}-panel-${String(index)}`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${String(index)}`}
            className={styles["tabs-panel"]}
            data-selected={index === selected ? "" : undefined}
          >
            {props.renderChild(tab.child)}
          </div>
        ))}
      </div>
    </div>
  )
}
