// `Options`（候補の採否）を Markdown に戻さず直接描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { Badge } from "../../../components/ui/badge/badge.tsx"
import { optionNoteBody } from "../domain/reply-note.ts"
import { InlineCodeText, InlineMarkdown, noteLeafClassNames } from "../markdown.tsx"
import { ReplyUnitRow } from "./ask-frame.tsx"
import styles from "./leaf.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type OptionsPart = Extract<A2uiReportComponent, { readonly component: "Options" }>
type Option = OptionsPart["items"][number]

const VERDICTS = {
  adopt: { className: undefined, mark: "✓", label: "採る", tone: "ok" },
  consider: { className: undefined, mark: "〜", label: "検討", tone: "warn" },
  reject: {
    className: noteLeafClassNames.optionReject,
    mark: "–",
    label: "採らない",
    tone: "neutral",
  },
} as const satisfies Record<
  Option["verdict"],
  {
    className?: string
    mark: string
    label: string
    tone: "ok" | "warn" | "neutral"
  }
>

export function OptionsLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Options") {
    return <></>
  }
  return (
    <ReportLeafFrame value={value} title={part.title} fit={false}>
      <LeafFold fold={part.fold} empty={false}>
        {part.title.trim() !== "" && (
          <p>
            <strong>
              <InlineMarkdown text={part.title} />
            </strong>
          </p>
        )}
        <div className={noteLeafClassNames.options}>
          {part.items.map((item, index) => (
            <OptionRow key={`${String(index)}:${item.name}`} item={item} index={index} />
          ))}
        </div>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function OptionRow(props: { readonly item: Option; readonly index: number }): ReactElement {
  const { name, verdict, reason } = props.item
  const { className, mark, label, tone } = VERDICTS[verdict]
  return (
    <ReplyUnitRow
      index={props.index}
      label={name}
      requestText={optionNoteBody()}
      className={clsx(noteLeafClassNames.option, className)}
    >
      <span>
        <Badge tone={tone} shape="square" className={styles["verdict-badge"]}>
          <span aria-hidden="true">{mark}</span>
          {label}
        </Badge>
      </span>
      <span className={noteLeafClassNames.optionBody}>
        <span className={noteLeafClassNames.optionName}>
          <InlineCodeText text={name} />
        </span>
        {reason !== "" && (
          <>
            {" "}
            <span className={noteLeafClassNames.optionReason}>
              <InlineCodeText text={reason} />
            </span>
          </>
        )}
      </span>
    </ReplyUnitRow>
  )
}
