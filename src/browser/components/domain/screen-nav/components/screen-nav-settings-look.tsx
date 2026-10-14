// 設定のダイアログの「見た目」の面。3色の見本の帯と、色ごとの行（色見本の四角＋16進の読み出し）を置く。
// 色の読み書きは `ScreenNavSettings.colors`（`useAppearanceColor`）のままで、帯はその値をそのまま描く。

import { useId, type ReactElement } from "react"

import type { AppearanceColorKey } from "../../../../domain/appearance-color.ts"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./screen-nav-settings-look.module.css"
import rowStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

export function ScreenNavSettingsLookFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  function colorOf(key: AppearanceColorKey): string {
    return settings.colors.find((color) => color.key === key)?.value ?? "transparent"
  }

  return (
    <>
      <div className={styles["band"]} style={{ backgroundColor: colorOf("ground") }}>
        <span
          className={styles["band-surface"]}
          style={{ backgroundColor: colorOf("surface"), color: colorOf("ink") }}
        >
          領域の中の字
        </span>
        <span style={{ color: colorOf("ink") }}>地の上の字 あ Aa</span>
        <span className={styles["band-ring"]} title="差し色はキャラクターが決める" />
      </div>
      {settings.colors.map((color) => (
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="lg"
          align="center"
          justify="between"
          wrap="nowrap"
          className={rowStyles["screen-nav-settings-row"]}
          key={color.key}
        >
          <label htmlFor={`${fieldId}-${color.key}`}>{color.label}</label>
          <div className={styles["control"]}>
            <input
              id={`${fieldId}-${color.key}`}
              className={styles["swatch"]}
              type="color"
              value={color.value}
              onChange={(event) => {
                color.onChange(event.target.value)
              }}
            />
            <span className={styles["hex"]}>{color.value}</span>
          </div>
        </HStack>
      ))}
      {settings.colorNotice.kind === "shown" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={rowStyles["screen-nav-settings-notice"]}
        >
          {settings.colorNotice.text}
        </Text>
      )}
    </>
  )
}
