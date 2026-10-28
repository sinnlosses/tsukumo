// `Options`（候補の採否）を Markdown に戻さず直接描く。「採る」の行は筆を留める。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { InlineCodeText, InlineMarkdown, noteLeafClassNames } from "../markdown/markdown.tsx"
import { LeafFold, ReportLeafFrame, ReportPausePoint } from "./report-leaf-frame.tsx"

type OptionsPart = Extract<A2uiReportComponent, { readonly component: "Options" }>
type Option = OptionsPart["items"][number]

const VERDICTS = {
  adopt: { className: noteLeafClassNames.optionAdopt, label: "採る", pauses: true },
  consider: { className: noteLeafClassNames.optionConsider, label: "検討", pauses: false },
  reject: { className: noteLeafClassNames.optionReject, label: "採らない", pauses: false },
} as const satisfies Record<
  Option["verdict"],
  { className: string | undefined; label: string; pauses: boolean }
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
            <OptionRow key={`${String(index)}:${item.name}`} item={item} index={index} />
          ))}
        </div>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function OptionRow(props: { readonly item: Option; readonly index: number }): ReactElement {
  const { name, verdict, reason } = props.item
  const { className, label, pauses } = VERDICTS[verdict]
  const rowClassName = clsx(noteLeafClassNames.option, className)
  const row = (
    <>
      <span className={noteLeafClassNames.optionNumber}>{String(props.index + 1)}</span>
      <span className={noteLeafClassNames.optionVerdict}>{label}</span>
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
