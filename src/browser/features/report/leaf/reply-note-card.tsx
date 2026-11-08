// 付箋を本文の右の欄外に出す札と、いまの部品の付箋を求める読み口。

import clsx from "clsx"
import { type ReactElement, use } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import {
  notesOf,
  type ReplyNote,
  useReplyNotes,
  useReplySessionKey,
} from "../../../stores/reply-note-list.ts"
import { LeafIdentityContext, SectionPointContext } from "../leaf-point-context.ts"
import { leafFrameClassNames } from "../markdown.tsx"
import { ReplyPortContext } from "../reply-port.ts"
import styles from "./leaf.module.css"

export type NumberedNote = {
  /** セッションの付箋の並びでの番号（1 から）。 */
  readonly number: number
  readonly note: ReplyNote
}

/** この部品に付いた付箋（送った付箋も欄外に残す）。口・節・部品がそろわない描画では何も読まない。 */
export function useLeafNotes(): readonly NumberedNote[] {
  const slot = use(ReplyPortContext)
  const section = use(SectionPointContext)
  const leaf = use(LeafIdentityContext)
  const sessionKey = useReplySessionKey()
  const notesBySession = useReplyNotes((state) => state.notesBySession)
  if (slot.kind === "none" || section.kind === "none" || leaf.kind === "none") {
    return []
  }
  return notesOf(notesBySession, sessionKey)
    .map((note, index): NumberedNote => ({ number: index + 1, note }))
    .filter(
      ({ note }) =>
        note.target.key.reportToolUseId === section.reportToolUseId &&
        note.target.key.componentId === leaf.componentId,
    )
}

export function ReplyNoteCard(props: { readonly numbered: NumberedNote }): ReactElement {
  const { number, note } = props.numbered
  const sessionKey = useReplySessionKey()
  const removeNote = useReplyNotes((state) => state.removeNote)
  const { component, row } = note.target.label
  return (
    <aside
      className={clsx(
        leafFrameClassNames.gutterNote,
        styles["note-card"],
        note.state.kind === "sent" && styles["is-sent"],
      )}
    >
      <p className={styles["note-card-head"]}>
        <span className={styles["note-card-mark"]}>頼 {number}</span>
        <span className={styles["note-card-target"]}>{row ?? component}</span>
        {note.state.kind === "unsent" && (
          <Button
            variant="ghost"
            size="label"
            pressed="none"
            disabled={false}
            ariaLabel="付箋を外す"
            disclosure={{ kind: "none" }}
            className={styles["note-card-remove"]}
            onClick={() => {
              removeNote(sessionKey, note.id)
            }}
          >
            ×
          </Button>
        )}
      </p>
      <p>{note.body}</p>
      <p className={styles["note-card-state"]}>
        {note.state.kind === "sent"
          ? `送った → やり取り ${String(note.state.turn)} で作業中`
          : "まだ送っていない"}
      </p>
    </aside>
  )
}
