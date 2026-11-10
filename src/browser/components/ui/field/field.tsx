// 名札・入力欄・ヒントを縦に積む欄。中身は Astryx の `Field`。
// 名札の `htmlFor` は `id`（Astryx の `inputID`）から付け、入力欄（`children`）には同じ `id` を渡す。
// ヒントは Astryx の `description`（字だけで入力欄の上に置く）を使わず、入力欄の後ろに並べる。

import { Field as AstryxField } from "@astryxdesign/core/Field"
import type { ReactElement, ReactNode } from "react"

type FieldVariant = "form" | "confirm"

export type FieldProps = {
  readonly variant: FieldVariant
  readonly id: string
  readonly label: string
  /** ヒントの字。無いときは `undefined`。 */
  readonly hint: ReactNode
  readonly children: ReactNode
}

export function Field(props: FieldProps): ReactElement {
  return (
    <AstryxField label={props.label} inputID={props.id}>
      {props.children}
      {props.hint}
    </AstryxField>
  )
}
