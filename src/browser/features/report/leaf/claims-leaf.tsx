// `Claims`（確度つきの主張の並び）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { Badge } from "../../../components/ui/badge/badge.tsx"
import { claimNoteBody } from "../domain/reply-note.ts"
import { InlineMarkdown, textLeafClassNames } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { ReplyNoteButton } from "./reply-note-button.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type ClaimsPart = Extract<A2uiReportComponent, { readonly component: "Claims" }>

const CERTAINTIES = {
  confirmed: { mark: "✓", label: "確定", tone: "ok" },
  inferred: { mark: "〜", label: "推測", tone: "warn" },
  unverified: { mark: "？", label: "未確認", tone: "neutral" },
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
            <ClaimRow key={`${String(index)}:${item.claim}`} item={item} index={index} />
          ))}
        </div>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function ClaimRow(props: {
  readonly item: ClaimsPart["items"][number]
  readonly index: number
}): ReactElement {
  const { claim, certainty, basis, howToVerify } = props.item
  const { mark, label, tone } = CERTAINTIES[certainty]
  return (
    <div className={textLeafClassNames.claim}>
      <p>
        <span className={textLeafClassNames.claimCertainty}>
          <Badge tone={tone} shape="square" className={styles["verdict-badge"]}>
            <span className={textLeafClassNames.claimMark} aria-hidden="true">
              {mark}
            </span>
            {label}
          </Badge>
        </span>
        <span className={textLeafClassNames.claimText}>
          <InlineMarkdown text={claim} />
        </span>
        <ClaimField className={textLeafClassNames.claimBasis} name="根拠" text={basis} />
        <ClaimField className={textLeafClassNames.claimHow} name="確かめ方" text={howToVerify} />
        {certainty !== "confirmed" && (
          <span className={styles["claim-note"]}>
            <ReplyNoteButton
              title=""
              row={{ index: props.index, firstCell: claim }}
              label="確かめて"
              body={claimNoteBody(howToVerify)}
            />
          </span>
        )}
      </p>
    </div>
  )
}

function ClaimField(props: {
  readonly className?: string
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
