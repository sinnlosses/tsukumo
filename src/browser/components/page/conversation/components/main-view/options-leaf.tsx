// `Options`（候補の採否）を Markdown に戻さず直接描く。「採る」の行は筆を留める。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { Badge } from "../../../../ui/badge/badge.tsx"
import { InlineCodeText, InlineMarkdown, noteLeafClassNames } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"
import { LeafFold, ReportLeafFrame, ReportPausePoint } from "./report-leaf-frame.tsx"

type OptionsPart = Extract<A2uiReportComponent, { readonly component: "Options" }>
type Option = OptionsPart["items"][number]

const VERDICTS = {
  adopt: { className: undefined, mark: "✓", label: "採る", tone: "ok", pauses: true },
  consider: { className: undefined, mark: "〜", label: "検討", tone: "warn", pauses: false },
  reject: {
    className: noteLeafClassNames.optionReject,
    mark: "–",
    label: "採らない",
    tone: "neutral",
    pauses: false,
  },
} as const satisfies Record<
  Option["verdict"],
  {
    className: string | undefined
    mark: string
    label: string
    tone: "ok" | "warn" | "neutral"
    pauses: boolean
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
    <ReportLeafFrame value={value} title="" fit={false}>
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
            <OptionRow key={`${String(index)}:${item.name}`} item={item} />
          ))}
        </div>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function OptionRow(props: { readonly item: Option }): ReactElement {
  const { name, verdict, reason } = props.item
  const { className, mark, label, tone, pauses } = VERDICTS[verdict]
  const rowClassName = clsx(noteLeafClassNames.option, className)
  const row = (
    <>
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
    </>
  )
  return pauses ? (
    <ReportPausePoint className={rowClassName}>{row}</ReportPausePoint>
  ) : (
    <div className={rowClassName}>{row}</div>
  )
}
