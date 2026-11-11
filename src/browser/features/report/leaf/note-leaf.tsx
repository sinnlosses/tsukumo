// `Note`（注記）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { REPORT_NOTE_KINDS } from "../../../../shared/report/report-notation.ts"
import { Note } from "../../../components/ui/note/note.tsx"
import { InlineMarkdown } from "../markdown.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type NoteTone = Exclude<Extract<A2uiReportComponent, { component: "Note" }>["tone"], "memo">

const NOTE_KIND_NAMES = {
  info: "note",
  warn: "note-warn",
  ng: "note-ng",
  ask: "note-ask",
} as const satisfies Record<NoteTone, string>

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
  const kindName = NOTE_KIND_NAMES[props.tone]
  const label = REPORT_NOTE_KINDS.find(([name]) => name === kindName)?.[1] ?? ""
  return (
    <Note tone={props.tone} title={label}>
      <InlineMarkdown text={props.text} />
    </Note>
  )
}
