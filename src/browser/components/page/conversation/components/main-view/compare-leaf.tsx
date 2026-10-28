// `Compare`（2つの側を見出しと箇条で見比べる）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { compareLeafClassNames, FoldedList, InlineCodeText } from "../markdown/markdown.tsx"
import { FoldedLeafFrame } from "./report-leaf-frame.tsx"

type CompareSide = Extract<A2uiReportComponent, { readonly component: "Compare" }>["sides"][number]

export function CompareLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Compare") {
    return <></>
  }
  return (
    <FoldedLeafFrame value={value} title={part.title} fit={false} fold={part.fold} swap={false}>
      <div className={compareLeafClassNames.compare}>
        {part.sides.map((side) => (
          <Side key={side.heading} side={side} />
        ))}
      </div>
    </FoldedLeafFrame>
  )
}

/** 箇条は 10 項目を超えたら 10 項目で切る（Markdown の `ul` と同じ）。 */
function Side(props: { readonly side: CompareSide }): ReactElement {
  const { heading, points } = props.side
  return (
    <div className={compareLeafClassNames.compareSide}>
      <div className={compareLeafClassNames.compareHeading}>
        <InlineCodeText text={heading} />
      </div>
      <FoldedList renderList={(items) => <ul>{items}</ul>}>
        {points.map((point, index) => (
          <li key={`${String(index)}:${point}`}>
            <InlineCodeText text={point} />
          </li>
        ))}
      </FoldedList>
    </div>
  )
}
