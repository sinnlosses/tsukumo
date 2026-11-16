// 初めて出た語や部品の説明を、面の下端に1行ずつ添える部品。右端の「分かった」を押すと `onAcknowledge` を呼ぶ。

import type { ReactElement } from "react"

import { Button } from "../button/button.tsx"
import { Text } from "../text/text.tsx"
import styles from "./first-note-list.module.css"

const ACKNOWLEDGE_LABEL = "分かった"

export type FirstNoteView = {
  readonly id: string
  readonly text: string
}

export function FirstNoteList(props: {
  readonly notes: readonly FirstNoteView[]
  readonly onAcknowledge: (id: string) => void
}): ReactElement {
  return (
    <>
      {props.notes.map((note) => (
        <p key={note.id} className={styles["first-note"]} data-first-note={note.id}>
          <Text element="span" size="secondary" tone="ink-quiet" weight="inherit" className="">
            {note.text}
          </Text>
          <Button
            variant="ghost"
            size="secondary"
            pressed="none"
            disabled={false}
            disclosure={{ kind: "none" }}
            className={styles["first-note-button"]}
            onClick={() => {
              props.onAcknowledge(note.id)
            }}
          >
            {ACKNOWLEDGE_LABEL}
          </Button>
        </p>
      ))}
    </>
  )
}
