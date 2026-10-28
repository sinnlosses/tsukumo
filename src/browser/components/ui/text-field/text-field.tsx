// 領域をまたいで使う入力欄（1行の `<input>` と複数行の `<textarea>`）。
// 持つ見た目は、どの入力欄でも同じになる分だけ（地・字の色・枠の線・角丸・字の段）。
// 寸法・余白・`resize`・行間と、枠の色を変えたいときの色は呼び出し側が `className` で渡す。

import clsx from "clsx"
import type { ReactElement } from "react"

import styles from "./text-field.module.css"

type TextFieldProps = {
  readonly element: "input" | "textarea"
  readonly id: string
  readonly className: string
  readonly value: string
  readonly maxLength?: number
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

export function TextField(props: TextFieldProps): ReactElement {
  const className = clsx(styles["text-field"], props.className)
  if (props.element === "textarea") {
    return (
      <textarea
        id={props.id}
        className={className}
        value={props.value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    )
  }
  return (
    <input
      id={props.id}
      type="text"
      className={className}
      value={props.value}
      maxLength={props.maxLength}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}
