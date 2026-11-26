// 1つだけを選ぶボタンの並びを描く部品。中身は Astryx の `SegmentedControl`（`role="radiogroup"`・`role="radio"`・`aria-checked`）。
// 件数のような添え字は項目の `label` の文字列に含める。選んだ値は `items` から引いて `T` で返す。

import {
  SegmentedControl as AstryxSegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl"
import type { ReactElement, ReactNode } from "react"

type SegmentItem<T extends string> = {
  readonly value: T
  readonly label: string
  readonly icon?: ReactNode
}

type SegmentedControlProps<T extends string> = {
  /** 読み上げの名前（画面には出ない）。 */
  readonly label: string
  readonly value: T
  readonly items: readonly SegmentItem<T>[]
  readonly onChange: (value: T) => void
}

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): ReactElement {
  return (
    <AstryxSegmentedControl
      label={props.label}
      value={props.value}
      onChange={(next) => {
        const item = props.items.find((candidate) => candidate.value === next)
        if (item !== undefined) props.onChange(item.value)
      }}
    >
      {props.items.map((item) => (
        <SegmentedControlItem
          key={item.value}
          value={item.value}
          label={item.label}
          {...(item.icon === undefined ? {} : { icon: item.icon })}
        />
      ))}
    </AstryxSegmentedControl>
  )
}
