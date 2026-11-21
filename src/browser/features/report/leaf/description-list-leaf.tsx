// `DescriptionList`（名前と値の対の並び）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import { plainInlineMarkdown } from "../../../../shared/report/report-inline-markdown.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import {
  MetadataList,
  MetadataListItem,
} from "../../../components/ui/metadata-list/metadata-list.tsx"
import { InlineMarkdown } from "../markdown.tsx"
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
        <MetadataList>
          {part.items.map((item, index) => (
            <MetadataListItem
              key={`${String(index)}:${item.term}`}
              label={plainInlineMarkdown(item.term)}
            >
              <InlineMarkdown text={item.description} />
            </MetadataListItem>
          ))}
        </MetadataList>
      </LeafFold>
    </ReportLeafFrame>
  )
}
