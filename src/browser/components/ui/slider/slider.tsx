// 数を連続して選ぶスライダーを描く部品。中身は Astryx の `Slider`（`role="slider"`）。
// 値は常に文字で読める。

import { Slider as AstryxSlider } from "@astryxdesign/core/Slider"
import type { ReactElement } from "react"

type SliderProps = {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly disabled: boolean
  readonly onChange: (value: number) => void
}

export function Slider(props: SliderProps): ReactElement {
  return (
    <AstryxSlider
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      width="100%"
      valueDisplay="text"
      isDisabled={props.disabled}
      onChange={props.onChange}
    />
  )
}
