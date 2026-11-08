// 案・主張の行に置く、押すと付箋にするボタン。付箋にした所は押せない「付箋にした」に変わる。
// 口・節・部品がそろわない描画には出さない。

import type { ReactElement } from "react"

import { Button } from "../../../components/ui/button/button.tsx"
import { notesOf, unsentNotesAt, useReplyNotes } from "../../../stores/reply-note-list.ts"
import { useRowTarget } from "./ask-frame.tsx"
import styles from "./leaf.module.css"

export function ReplyNoteButton(props: {
  readonly title: string
  readonly row: { readonly index: number; readonly firstCell: string }
  readonly label: string
  readonly body: string
}): ReactElement {
  const rowTarget = useRowTarget(props.title)
  const notesBySession = useReplyNotes((state) => state.notesBySession)
  const addNote = useReplyNotes((state) => state.addNote)
  if (rowTarget.kind === "none") {
    return <></>
  }
  const target = rowTarget.targetOf(props.row)
  const noted = unsentNotesAt(notesOf(notesBySession, rowTarget.sessionKey), target.key).length > 0
  return (
    <>
      {" "}
      <Button
        variant="outline"
        size="label"
        pressed="none"
        disabled={noted}
        disclosure={{ kind: "none" }}
        className={styles["note-button"]}
        onClick={() => {
          addNote(rowTarget.sessionKey, target, props.body)
        }}
      >
        {noted ? "付箋にした" : props.label}
      </Button>
    </>
  )
}
