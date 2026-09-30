// 差し色の色見本1つ（画面の差し色・立ち絵の差し色の両方）。
// 札全体が `<label>` で、左の色見本は `<input type="color">` そのもの（押すとブラウザの色の選び方が開く）。
// 右端に今の値を16進の字で添える（色だけにしない）。

import type { ReactElement } from "react"

import { Text } from "../../../../ui/text/text.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import styles from "../../character.module.css"

/** 色見本1つ（画面の差し色・衣装ごとの差し色の両方）。`value` は16進のまま字にも出す。 */
export type AccentSwatchModel = {
  readonly inputId: string
  readonly label: string
  /** ラベルの下に小さく添える字（衣装のモデル名）。 */
  readonly sublabel: { readonly kind: "none" } | { readonly kind: "shown"; readonly text: string }
  /** 読み上げの名前（ラベルと添え字をつないだもの）。 */
  readonly ariaLabel: string
  readonly value: string
  readonly onChange: (color: string) => void
}

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
        name={{ kind: "none" }}
        ref={undefined}
        gap="none"
        align="stretch"
        justify="start"
        wrap="nowrap"
        className={styles["character-swatch-name"]}
      >
        <Text element="span" size="secondary" tone="inherit" weight="inherit" className="">
          {swatch.label}
        </Text>
        {swatch.sublabel.kind === "shown" && (
          <Text element="span" size="label" tone="ink-quiet" weight="inherit" className="">
            {swatch.sublabel.text}
          </Text>
        )}
      </VStack>
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
