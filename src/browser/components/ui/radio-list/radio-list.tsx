// 1つだけを選ぶ縦の選択肢を、各行の説明つきで描く部品。中身は Astryx の `RadioList`（`role="radiogroup"`・`input[type=radio]`）。
// 欄の頭は呼び側が出すので、`label` は読み上げの名前にだけ使う。選んだ値は `items` から引いて `T` で返す。

import { RadioList as AstryxRadioList, RadioListItem } from "@astryxdesign/core/RadioList"
import type { ReactElement } from "react"

type RadioItem<T extends string> = {
  readonly value: T
  readonly label: string
  readonly description?: string
}

type RadioListProps<T extends string> = {
  /** 読み上げの名前（画面には出ない）。 */
  readonly label: string
  readonly value: T
  readonly items: readonly RadioItem<T>[]
  readonly disabled: boolean
  readonly onChange: (value: T) => void
}

export function RadioList<T extends string>(props: RadioListProps<T>): ReactElement {
  return (
    <AstryxRadioList
      label={props.label}
      isLabelHidden
      value={props.value}
      isDisabled={props.disabled}
      onChange={(next) => {
        const item = props.items.find((candidate) => candidate.value === next)
        if (item !== undefined) props.onChange(item.value)
      }}
    >
      {props.items.map((item) => (
        <RadioListItem
          key={item.value}
          value={item.value}
          label={item.label}
          {...(item.description === undefined ? {} : { description: item.description })}
        />
      ))}
    </AstryxRadioList>
  )
}
