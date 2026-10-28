// `Paragraph`（地の文）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { InlineMarkdown } from "../markdown/markdown.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

export function ParagraphLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Paragraph") {
    return <></>
  }
  const empty = part.text.trim() === ""
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={empty}>
        {!empty && (
          <p>
            <InlineMarkdown text={part.text} />
          </p>
        )}
      </LeafFold>
    </ReportLeafFrame>
  )
}
