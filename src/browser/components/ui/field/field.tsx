// 名札・入力欄・ヒントを縦に積む欄。`label` の `htmlFor` は `id` から付け、入力欄（`children`）には同じ `id` を渡す。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import styles from "./field.module.css"

export type FieldVariant = "form" | "confirm"

export type FieldProps = {
  readonly variant: FieldVariant
  readonly id: string
  readonly label: string
  /** ヒントの字。無いときは `undefined`。 */
  readonly hint: ReactNode
  readonly children: ReactNode
}

const FIELD_BOX_CLASS = {
  form: styles["field-form"],
  confirm: undefined,
} satisfies Record<FieldVariant, string | undefined>

const FIELD_LABEL_CLASS = {
  form: styles["field-label-form"],
  confirm: styles["field-label-confirm"],
} satisfies Record<FieldVariant, string | undefined>

export function Field(props: FieldProps): ReactElement {
  return (
    <div className={clsx(styles["field"], FIELD_BOX_CLASS[props.variant])}>
      <label className={FIELD_LABEL_CLASS[props.variant]} htmlFor={props.id}>
        {props.label}
      </label>
      {props.children}
      {props.hint}
    </div>
  )
}
