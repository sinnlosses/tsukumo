// 差し色の色見本1つ。
// 札全体が `<label>` で、左の色見本は `<input type="color">` そのもの（押すとブラウザの色の選び方が開く）。
// 右端に今の値を16進の字で添える（色だけにしない）。

import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import type { AccentSwatchModel } from "../../domain/accent-swatch-model.ts"
import styles from "./accent-swatch.module.css"

export function AccentSwatch(props: {
  readonly swatch: AccentSwatchModel
  readonly disabled: boolean
}): ReactElement {
  const { swatch, disabled } = props

  return (
    <label className={styles["character-swatch"]} htmlFor={swatch.inputId}>
      <input
        id={swatch.inputId}
        type="color"
        className={styles["character-swatch-color"]}
        aria-label={swatch.label}
        disabled={disabled}
        value={swatch.value}
        onChange={(event) => {
          swatch.onChange(event.target.value)
        }}
      />
      <Text
        element="span"
        size="secondary"
        tone="inherit"
        weight="inherit"
        className={styles["character-swatch-name"]}
      >
        {swatch.label}
      </Text>
      <Text
        element="span"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["character-swatch-hex"]}
      >
        {swatch.value}
      </Text>
    </label>
  )
}
