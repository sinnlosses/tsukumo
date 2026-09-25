// 差し色の色見本1つ（画面の差し色・立ち絵の差し色の両方。docs/screen-design.md 13.6）。**札全体が
// `<label>`** で、左の色見本は `<input type="color">` そのもの（押すとブラウザの色の選び方が開く）。
// 右端に今の値を16進の字で添える（色だけにしない。13.1 原則1）。

import { type ReactElement } from "react"

import { Text } from "../../../../components/ui/text/text.tsx"
import { VStack } from "../../../../components/ui/v-stack/v-stack.tsx"
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
      <VStack
        element="span"
        gap="none"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-swatch-name"] ?? ""}
      >
        <Text element="span" size="secondary" tone="inherit" weight="inherit" className="">
          {swatch.label}
        </Text>
        {swatch.sublabel.kind === "shown" ? (
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {swatch.sublabel.text}
          </Text>
        ) : null}
      </VStack>
      <Text
        element="span"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["character-swatch-hex"] ?? ""}
      >
        {swatch.value}
      </Text>
    </label>
  )
}
