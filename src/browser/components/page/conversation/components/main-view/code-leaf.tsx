// `Code`（コード・コマンド・エラー文）を Markdown に戻さず直接描く。色付け・帯・写しボタン・印の行は `Pre` と同じ描き方。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { CodeFence } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

export function CodeLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Code") {
    return <></>
  }
  return (
    <FoldedLeafFrame value={value} title="" fit={false} fold={part.fold} swap={false}>
      <CodeFence
        language={part.language}
        path={part.path}
        marks={part.marks}
        source={part.source}
      />
    </FoldedLeafFrame>
  )
}
