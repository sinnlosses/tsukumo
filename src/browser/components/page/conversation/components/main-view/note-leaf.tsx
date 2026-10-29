// `Note`（注記）を Markdown に戻さず直接描く。注意（warn）と異常（ng）は筆を留める。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { REPORT_NOTE_KINDS } from "../../../../../../shared/report/report-notation.ts"
import { InlineMarkdown, NoteLabel, noteLeafClassNames } from "../markdown/markdown.tsx"
import { LeafFold, ReportLeafFrame, ReportPausePoint } from "./report-leaf-frame.tsx"

type NoteTone = Exclude<Extract<A2uiReportComponent, { component: "Note" }>["tone"], "memo">

const NOTE_KINDS = {
  info: { kindName: "note", className: () => noteLeafClassNames.note, pauses: false },
  warn: {
    kindName: "note-warn",
    className: () => clsx(noteLeafClassNames.note, noteLeafClassNames.noteWarn),
    pauses: true,
  },
  ng: {
    kindName: "note-ng",
    className: () => clsx(noteLeafClassNames.note, noteLeafClassNames.noteNg),
    pauses: true,
  },
  ask: {
    kindName: "note-ask",
    className: () => clsx(noteLeafClassNames.note, noteLeafClassNames.noteAsk),
    pauses: false,
  },
} as const satisfies Record<
  NoteTone,
  { kindName: string; className: () => string; pauses: boolean }
>

export function NoteLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Note" || part.tone === "memo") {
    return <></>
  }
  const empty = part.text.trim() === ""
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={empty}>
        {!empty && <NoteBody tone={part.tone} text={part.text} />}
      </LeafFold>
    </ReportLeafFrame>
  )
}

export function NoteBody(props: { readonly tone: NoteTone; readonly text: string }): ReactElement {
  const { kindName, className, pauses } = NOTE_KINDS[props.tone]
  const label = REPORT_NOTE_KINDS.find(([name]) => name === kindName)?.[1] ?? ""
  const content: ReactNode = (
    <>
      <NoteLabel kindName={kindName} label={label} />
      <p>
        <InlineMarkdown text={props.text} />
      </p>
    </>
  )
  return pauses ? (
    <ReportPausePoint className={className()}>{content}</ReportPausePoint>
  ) : (
    <div className={className()}>{content}</div>
  )
}
