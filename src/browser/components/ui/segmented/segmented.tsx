// 2つ以上の選択肢から1つを選ぶ切り替えの部品（仕事と雑談など）。中身は Astryx の `SegmentedControl`。
// ←→ での移動と読み上げは Astryx が持つ。

import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl"
import type { ReactElement } from "react"

export type SegmentedOption = { readonly value: string; readonly label: string }

export type SegmentedProps = {
  readonly ariaLabel: string
  readonly value: string
  readonly options: readonly SegmentedOption[]
  readonly onChange: (value: string) => void
}

export function Segmented(props: SegmentedProps): ReactElement {
  return (
    <SegmentedControl label={props.ariaLabel} value={props.value} onChange={props.onChange}>
      {props.options.map((option) => (
        <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
      ))}
    </SegmentedControl>
  )
}
