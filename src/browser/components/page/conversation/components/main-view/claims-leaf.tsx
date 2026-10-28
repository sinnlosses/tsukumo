// `Claims`（確度つきの主張の並び）を Markdown に戻さず直接描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { InlineMarkdown, textLeafClassNames } from "../markdown/markdown.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type ClaimsPart = Extract<A2uiReportComponent, { readonly component: "Claims" }>

const CERTAINTIES = {
  confirmed: { className: textLeafClassNames.claimConfirmed, mark: "✓", label: "確定" },
  inferred: { className: textLeafClassNames.claimInferred, mark: "〜", label: "推測" },
  unverified: { className: textLeafClassNames.claimUnverified, mark: "？", label: "未確認" },
} as const

export function ClaimsLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Claims") {
    return <></>
  }
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={false}>
        <div className={textLeafClassNames.claims}>
          {part.items.map((item, index) => (
            <ClaimRow key={`${String(index)}:${item.claim}`} item={item} />
          ))}
        </div>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function ClaimRow(props: { readonly item: ClaimsPart["items"][number] }): ReactElement {
  const { claim, certainty, basis, howToVerify } = props.item
  const { className, mark, label } = CERTAINTIES[certainty]
  return (
    <div className={clsx(textLeafClassNames.claim, className)}>
      <p>
        <span className={textLeafClassNames.claimCertainty}>
          <span className={textLeafClassNames.claimMark} aria-hidden="true">
            {mark}
          </span>
          {label}
        </span>
        <span className={textLeafClassNames.claimText}>
          <InlineMarkdown text={claim} />
        </span>
        <ClaimField className={textLeafClassNames.claimBasis} name="根拠" text={basis} />
        <ClaimField className={textLeafClassNames.claimHow} name="確かめ方" text={howToVerify} />
      </p>
    </div>
  )
}

function ClaimField(props: {
  readonly className: string | undefined
  readonly name: string
  readonly text: string
}): ReactElement {
  return props.text.trim() === "" ? (
    <></>
  ) : (
    <span className={props.className}>
      <span className={textLeafClassNames.claimField}>{props.name}</span>
      <InlineMarkdown text={props.text} />
    </span>
  )
}
