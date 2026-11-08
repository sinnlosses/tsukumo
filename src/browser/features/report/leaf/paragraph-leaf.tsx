// `Paragraph`（地の文）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { InlineMarkdown } from "../markdown.tsx"
import { chartTermHandlers, useChartTermLink } from "./chart-term-link.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

export function ParagraphLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  const link = useChartTermLink()
  if (part.component !== "Paragraph") {
    return <></>
  }
  const empty = part.text.trim() === ""
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={empty}>
        {!empty && (
          <p {...chartTermHandlers(link)}>
            <InlineMarkdown
              text={part.text}
              chartTerms={link.terms.size === 0 ? undefined : link.terms}
            />
          </p>
        )}
      </LeafFold>
    </ReportLeafFrame>
  )
}
