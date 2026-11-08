// 部品の下に開く、その場の入力欄。指した所を欄の頭に出し、⌘⏎ で `ask` に渡して閉じる。

import { type KeyboardEvent, type ReactElement, useId, useRef, useState } from "react"

import type { ReplyTarget } from "../../../../shared/session/reply-target.ts"
import { Button } from "../../../components/ui/button/button.tsx"
import { TextField } from "../../../components/ui/text-field/text-field.tsx"
import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import styles from "./leaf.module.css"

type AskBoxProps = {
  readonly target: ReplyTarget
  readonly onSend: (text: string) => void
  readonly onClose: () => void
}

export function AskBox(props: AskBoxProps): ReactElement {
  const [text, setText] = useState("")
  const boxRef = useRef<HTMLDivElement>(null)
  const fieldId = useId()
  const sendable = text.trim() !== ""
  useMountEffect(() => {
    boxRef.current?.querySelector("textarea")?.focus()
  })
  const send = () => {
    if (sendable) {
      props.onSend(text.trim())
      props.onClose()
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      props.onClose()
    } else if (event.key === "Enter" && event.metaKey) {
      event.preventDefault()
      send()
    }
  }
  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="聞く"
      className={styles["ask-box"]}
      onKeyDown={onKeyDown}
    >
      <label htmlFor={fieldId} className={styles["ask-target"]}>
        指した所: {targetCaption(props.target)}
      </label>
      <TextField
        element="textarea"
        id={fieldId}
        className={styles["ask-field"]}
        value={text}
        onChange={setText}
      />
      <div className={styles["ask-foot"]}>
        <span className={styles["ask-note"]}>答えはこの下に返る。作業は始めない</span>
        <Button
          variant="ghost"
          size="label"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className={styles["ask-cancel"]}
          onClick={props.onClose}
        >
          やめる
        </Button>
        <Button
          variant="solid-accent"
          size="label"
          pressed="none"
          disabled={!sendable}
          disclosure={{ kind: "none" }}
          className={styles["ask-send"]}
          onClick={send}
        >
          聞く ⌘⏎
        </Button>
      </div>
    </div>
  )
}

function targetCaption(target: ReplyTarget): string {
  const { section, component, row } = target.label
  return [section, component, row].filter((part) => part !== undefined).join(" › ")
}
