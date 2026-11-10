// 領域をまたいで使う入力欄（1行と複数行）。中身は Astryx の `TextInput`・`TextArea`。
// 名札は外の `Field`・`<label htmlFor>` が持つので、入力欄の側の名札は隠す（同じ字を渡すと名前が二重になる）。
// 寸法・余白・`resize` などは呼び出し側が `className`（Astryx の `controlClassName`）で渡す。

import { TextArea } from "@astryxdesign/core/TextArea"
import { TextInput } from "@astryxdesign/core/TextInput"
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
  if (props.element === "textarea") {
    return (
      <TextArea
        label=""
        isLabelHidden
        id={props.id}
        controlClassName={clsx(styles["text-field-textarea-control"], props.className)}
        value={props.value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        isDisabled={props.disabled}
        onChange={(value) => props.onChange(value)}
      />
    )
  }
  // `TextInput` の型に `maxLength` は無いが、残りの props として入力欄へ通る。
  const passedToInput = { maxLength: props.maxLength }
  return (
    <TextInput
      {...passedToInput}
      label=""
      isLabelHidden
      id={props.id}
      controlClassName={clsx(styles["text-field-control"], props.className)}
      value={props.value}
      placeholder={props.placeholder}
      isDisabled={props.disabled}
      onChange={(value) => props.onChange(value)}
    />
  )
}
