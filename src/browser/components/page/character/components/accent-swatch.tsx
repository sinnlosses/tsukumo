// 差し色の色見本1つ（画面の差し色・立ち絵の差し色の両方。docs/screen-design.md 13.6）。**札全体が
// `<label>`** で、左の色見本は `<input type="color">` そのもの（押すとブラウザの色の選び方が開く）。
// 右端に今の値を16進の字で添える（色だけにしない。13.1 原則1）。

import { type ReactElement } from "react"

import styles from "../character-screen.module.css"
import { type AccentSwatchModel } from "../hooks/use-character-edit.ts"

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
        aria-label={swatch.ariaLabel}
        disabled={disabled}
        value={swatch.value}
        onChange={(event) => {
          swatch.onChange(event.target.value)
        }}
      />
      <span className={styles["character-swatch-name"]}>
        <span>{swatch.label}</span>
        {swatch.sublabel.kind === "shown" ? (
          <span className={styles["character-swatch-sublabel"]}>{swatch.sublabel.text}</span>
        ) : null}
      </span>
      <span className={styles["character-swatch-hex"]}>{swatch.value}</span>
    </label>
  )
}
