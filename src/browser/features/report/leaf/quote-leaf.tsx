// `Quote`（引用の文と出典の1行）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { Quote } from "../../../components/ui/quote/quote.tsx"
import { InlineMarkdown } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

export function QuoteLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Quote") {
    return <></>
  }
  const empty = part.text.trim() === ""
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={empty}>
        {!empty && (
          <div className={styles["quote-block"]}>
            <Quote
              source={
                part.source.trim() === "" ? (
                  ""
                ) : (
                  <>
                    — <InlineMarkdown text={part.source} />
                  </>
                )
              }
            >
              <InlineMarkdown text={part.text} />
            </Quote>
          </div>
        )}
      </LeafFold>
    </ReportLeafFrame>
  )
}
