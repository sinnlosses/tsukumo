// 一覧を絞る検索欄（combobox の形）。中身は Astryx の `TextInput`（`type="search"`）。
// 枠は呼び出し側の箱が持つので、ここは枠・背景・影を持たず、箱の残りを埋める。
// 選んでいる行は `aria-activedescendant` で指し、DOM のフォーカスは欄に残す。

import { TextInput } from "@astryxdesign/core/TextInput"
import clsx from "clsx"
import type { KeyboardEvent, ReactElement } from "react"

import styles from "./search-field.module.css"

type SearchFieldProps = {
  /** 読み上げの名前。画面には出さない。 */
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  /** 候補の一覧（listbox）の DOM の id。 */
  readonly listId: string
  /** 選んでいる行の DOM の id。行が無ければ `undefined`。 */
  readonly activeOptionId?: string
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  readonly placeholder?: string
  /** 開いたときにフォーカスを置く。Astryx が `data-autofocus` を書くので、`Dialog` の中でも効く。 */
  readonly hasAutoFocus?: boolean
  readonly className?: string
}

export function SearchField(props: SearchFieldProps): ReactElement {
  return (
    <TextInput
      type="search"
      role="combobox"
      aria-expanded={true}
      aria-controls={props.listId}
      aria-activedescendant={props.activeOptionId}
      label={props.label}
      isLabelHidden
      containerClassName={styles["search-field-container"]}
      controlClassName={clsx(styles["search-field-control"], props.className)}
      value={props.value}
      placeholder={props.placeholder}
      hasAutoFocus={props.hasAutoFocus}
      onChange={(value) => props.onChange(value)}
      onKeyDown={(event) => props.onKeyDown(event)}
    />
  )
}
