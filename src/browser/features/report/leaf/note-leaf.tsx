// `Note`（注記）を Markdown に戻さず直接描く。
// 紙の中では、本文に割り込む箱を注意（warn）と戻せない操作（ng）の2つだけにする。
// 補足（info）は欄外の字で出し、問い（ask）は紙の頭の「あなたの番」が受けるので本文には描かない。

import clsx from "clsx"
import { type ReactElement, use } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { REPORT_NOTE_KINDS } from "../../../../shared/report/report-notation.ts"
import { Note } from "../../../components/ui/note/note.tsx"
import { InlineMarkdown } from "../markdown.tsx"
import { PaperContext } from "../paper/paper-context.ts"
import styles from "./leaf.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type NoteTone = Exclude<Extract<A2uiReportComponent, { component: "Note" }>["tone"], "memo">

const NOTE_KIND_NAMES = {
  info: "note",
  warn: "note-warn",
  ng: "note-ng",
  ask: "note-ask",
} as const satisfies Record<NoteTone, string>

const CAUTION_MARKS = { warn: "!", ng: "✕" } as const

export function NoteLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  const inPaper = use(PaperContext)
  if (part.component !== "Note" || part.tone === "memo") {
    return <></>
  }
  const empty = part.text.trim() === "" || (inPaper && part.tone === "ask")
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={empty}>
        {!empty && <NoteBody tone={part.tone} text={part.text} inPaper={inPaper} />}
      </LeafFold>
    </ReportLeafFrame>
  )
}

export function NoteBody(props: {
  readonly tone: NoteTone
  readonly text: string
  readonly inPaper: boolean
}): ReactElement {
  const kindName = NOTE_KIND_NAMES[props.tone]
  const label = REPORT_NOTE_KINDS.find(([name]) => name === kindName)?.[1] ?? ""
  if (props.inPaper && (props.tone === "warn" || props.tone === "ng")) {
    return (
      <div
        className={clsx(styles["caution"], styles[`caution-${props.tone}`])}
        role="note"
        aria-label={label}
      >
        <i className={styles["caution-mark"]} aria-hidden="true">
          {CAUTION_MARKS[props.tone]}
        </i>
        <div className={styles["caution-body"]}>
          <InlineMarkdown text={props.text} />
        </div>
      </div>
    )
  }
  if (props.inPaper && props.tone === "info") {
    return (
      <aside className={styles["note-aside"]}>
        <span className={styles["note-aside-label"]}>補足</span>
        <InlineMarkdown text={props.text} />
      </aside>
    )
  }
  return (
    <Note tone={props.tone} title={label}>
      <InlineMarkdown text={props.text} />
    </Note>
  )
}
