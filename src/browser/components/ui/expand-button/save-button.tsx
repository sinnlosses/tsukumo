// 最終レポートを HTML で保存する口。印と字の1つの形で、「広げる」（`ExpandButton`）と同じ置き場に並ぶ。
// `head` は紙の頭の右端（控えめな字のボタン）、`bar` は広げた板の下端の帯（「閉じる」と同じ outline-surface）。
// 保存している間は押せず、字が「保存しています」に替わる。済んだら「保存した」。

import type { ReactElement } from "react"

import { Button } from "../button/button.tsx"
import { CheckIcon, SaveFileIcon } from "../icon/icon.tsx"
import styles from "./save-button.module.css"

export type SaveState = "idle" | "saving" | "saved"

const LABEL = {
  idle: "HTML で保存",
  saving: "保存しています",
  saved: "保存した",
} as const satisfies Record<SaveState, string>

export type SaveButtonProps = {
  readonly placement: "head" | "bar"
  readonly state: SaveState
  readonly className: string
  readonly onClick: () => void
}

export function SaveButton(props: SaveButtonProps): ReactElement {
  const label = LABEL[props.state]
  const disabled = props.state === "saving"
  const icon = props.state === "saved" ? <CheckIcon /> : <SaveFileIcon />
  if (props.placement === "bar") {
    return (
      <span className={props.className}>
        <Button
          variant="outline-surface"
          size="secondary"
          pressed="none"
          disabled={disabled}
          ariaLabel={label}
          disclosure={{ kind: "none" }}
          className={styles["bar"]}
          onClick={props.onClick}
        >
          <span className={styles["content"]}>
            {icon}
            {label}
          </span>
        </Button>
      </span>
    )
  }
  return (
    <span className={props.className}>
      <Button
        variant="ghost-hover-rule-soft"
        size="label"
        pressed="none"
        disabled={disabled}
        ariaLabel={label}
        disclosure={{ kind: "none" }}
        className={styles["target"]}
        onClick={props.onClick}
      >
        <span className={styles["content"]}>
          {icon}
          <span className={styles["label"]}>{label}</span>
        </span>
      </Button>
    </span>
  )
}
