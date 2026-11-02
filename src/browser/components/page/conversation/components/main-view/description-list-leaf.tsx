// `DescriptionList`（名前と値の対の並び）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { InlineMarkdown } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

export function DescriptionListLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "DescriptionList") {
    return <></>
  }
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={false}>
        <dl className={styles["description-list-leaf"]}>
          {part.items.map((item, index) => (
            <div key={`${String(index)}:${item.term}`} className={styles["description-list-row"]}>
              <dt className={styles["description-list-term"]}>
                <InlineMarkdown text={item.term} />
              </dt>
              <dd className={styles["description-list-description"]}>
                <InlineMarkdown text={item.description} />
              </dd>
            </div>
          ))}
        </dl>
      </LeafFold>
    </ReportLeafFrame>
  )
}
