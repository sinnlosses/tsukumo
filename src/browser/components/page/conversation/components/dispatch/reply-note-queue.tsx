// 入力欄の上の「頼みごと n 件」の列。付箋が無いときは何も出さない。
// 順番はドラッグか、行にフォーカスして Alt+↑↓ で変える。

import { useState, type ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { replyPlaceOf } from "../../domain/reply-batch-draft.ts"
import styles from "./dispatch.module.css"
import type { ReplyNoteQueueModel } from "./hooks/use-reply-note-queue.ts"

export function ReplyNoteQueue({
  notes,
  guide,
  draftLabel,
  draftDisabled,
  onMove,
  onDraft,
}: ReplyNoteQueueModel): ReactElement {
  const [draggingId, setDraggingId] = useState("")
  if (notes.length === 0) {
    return <></>
  }
  return (
    <div className={styles["reply-queue-slot"]}>
      <section className={styles["reply-queue"]} aria-label="頼みごと">
        <header className={styles["reply-queue-head"]}>
          <span>
            頼みごと <strong>{notes.length} 件</strong>
          </span>
          <span className={styles["reply-queue-hint"]}>ドラッグかAlt+↑↓で順番を変えられる</span>
        </header>
        <ol className={styles["reply-queue-list"]}>
          {notes.map((note, index) => (
            <li
              key={note.id}
              tabIndex={0}
              draggable
              className={styles["reply-queue-item"]}
              onDragStart={() => {
                setDraggingId(note.id)
              }}
              onDragOver={(event) => {
                event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggingId !== "") {
                  onMove(draggingId, index)
                }
                setDraggingId("")
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
                  return
                }
                event.preventDefault()
                onMove(note.id, event.key === "ArrowUp" ? index - 1 : index + 1)
              }}
            >
              <span className={styles["reply-queue-body"]}>{note.body}</span>
              <span className={styles["reply-queue-place"]}>{replyPlaceOf(note.target)}</span>
            </li>
          ))}
        </ol>
        <footer className={styles["reply-queue-foot"]}>
          <span className={styles["reply-queue-hint"]}>{guide}</span>
          <Button
            variant="solid-accent"
            size="label"
            pressed="none"
            disabled={draftDisabled}
            disclosure={{ kind: "none" }}
            className={styles["reply-queue-draft"]}
            onClick={onDraft}
          >
            {draftLabel}
          </Button>
        </footer>
      </section>
    </div>
  )
}
