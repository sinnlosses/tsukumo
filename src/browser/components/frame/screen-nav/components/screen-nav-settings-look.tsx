// 設定のダイアログの「見た目」の面。3色の見本の帯と、色ごとの行（色見本の四角＋16進の読み出し）、背景の暗さ・パネルのぼかし・パネルの濃さの範囲入力を置く。
// 色の読み書きは `ScreenNavSettings.colors`（`useAppearanceColor`）のままで、帯はその値をそのまま描く。

import { useId, type ReactElement } from "react"

import { BLUR_RANGE, FILL_RANGE, VEIL_PERCENT_RANGE } from "../../../../domain/appearance-adjust.ts"
import type { AppearanceColorKey } from "../../../../domain/appearance-color.ts"
import { Button } from "../../../ui/button/button.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Surface } from "../../../ui/surface/surface.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./screen-nav-settings-look.module.css"
import rowStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

export function ScreenNavSettingsLookFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const { adjust } = settings
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
            <Surface
              element="div"
              tone="ground"
              space="none"
              radius="md"
              shadow="none"
              className={styles["hex-face"]}
            >
              <span className={styles["hex"]}>{color.value}</span>
            </Surface>
          </div>
        </HStack>
      ))}
      <RangeRow
        id={`${fieldId}-veil`}
        label="背景の暗さ"
        range={VEIL_PERCENT_RANGE}
        value={adjust.veilPercent}
        readout={
          adjust.veilFollowsPack ? `${adjust.veilPercent}%（パックの値）` : `${adjust.veilPercent}%`
        }
        onChange={adjust.onChangeVeilPercent}
      />
      <RangeRow
        id={`${fieldId}-blur`}
        label="パネルのぼかし"
        range={BLUR_RANGE}
        value={adjust.blur}
        readout={`${adjust.blur}px`}
        onChange={adjust.onChangeBlur}
      />
      <RangeRow
        id={`${fieldId}-fill`}
        label="パネルの濃さ"
        range={FILL_RANGE}
        value={adjust.fill}
        readout={`${adjust.fill}%`}
        onChange={adjust.onChangeFill}
      />
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={rowStyles["screen-nav-settings-row"]}
      >
        <span>初回の説明</span>
        <Button
          variant="outline"
          size="secondary"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          className=""
          onClick={settings.onReplayFirstNotes}
        >
          初回の説明をもう一度出す
        </Button>
      </HStack>
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

function RangeRow(props: {
  readonly id: string
  readonly label: string
  readonly range: { readonly min: number; readonly max: number }
  readonly value: number
  readonly readout: string
  readonly onChange: (value: number) => void
}): ReactElement {
  return (
    <HStack
      element="div"
      name={{ kind: "none" }}
      gap="lg"
      align="center"
      justify="between"
      wrap="nowrap"
      className={rowStyles["screen-nav-settings-row"]}
    >
      <label htmlFor={props.id}>{props.label}</label>
      <div className={styles["control"]}>
        <input
          id={props.id}
          className={styles["range"]}
          type="range"
          min={props.range.min}
          max={props.range.max}
          step={1}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.valueAsNumber)
          }}
        />
        <output htmlFor={props.id} className={styles["readout"]}>
          {props.readout}
        </output>
      </div>
    </HStack>
  )
}
