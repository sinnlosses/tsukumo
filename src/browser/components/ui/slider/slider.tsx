// 数を連続して選ぶスライダーを描く部品。中身は Astryx の `Slider`（`role="slider"`）。
// 外に名前や値の字がある場所では、`labelVisibility`・`valueText` で名札（読み上げの名前は残る）や値の字を出す・隠すを選ぶ。

import { Slider as AstryxSlider } from "@astryxdesign/core/Slider"
import type { ReactElement } from "react"

type SliderProps = {
  readonly label: string
  /** `hidden` は名札を見えなくする（読み上げの名前は `label` のまま）。 */
  readonly labelVisibility: "shown" | "hidden"
  /** `hidden` は値の字を出さない（読み上げの値は残る）。 */
  readonly valueText: "shown" | "hidden"
  /** 値の字と読み上げの値の整形。無いときは数のまま。 */
  readonly formatValue?: (value: number) => string
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
      isLabelHidden={props.labelVisibility === "hidden"}
      value={props.value}
      min={props.min}
      max={props.max}
      step={props.step}
      width="100%"
      valueDisplay={props.valueText === "shown" ? "text" : "none"}
      formatValue={props.formatValue}
      isDisabled={props.disabled}
      onChange={props.onChange}
    />
  )
}
