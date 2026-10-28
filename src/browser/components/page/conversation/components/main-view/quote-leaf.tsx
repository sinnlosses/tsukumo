// `Quote`（引用の文と出典の1行）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { Surface } from "../../../../ui/surface/surface.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { InlineMarkdown } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"
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
          <Surface
            element="div"
            tone="surface"
            space="md"
            radius="sm"
            shadow="none"
            className={styles["quote-leaf"]}
          >
            <Text
              element="p"
              size="body"
              tone="ink"
              weight="normal"
              className={styles["quote-leaf-text"]}
            >
              <InlineMarkdown text={part.text} />
            </Text>
            {part.source.trim() !== "" && (
              <Text
                element="p"
                size="secondary"
                tone="ink-quiet"
                weight="normal"
                className={styles["quote-leaf-source"]}
              >
                — <InlineMarkdown text={part.source} />
              </Text>
            )}
          </Surface>
        )}
      </LeafFold>
    </ReportLeafFrame>
  )
}
