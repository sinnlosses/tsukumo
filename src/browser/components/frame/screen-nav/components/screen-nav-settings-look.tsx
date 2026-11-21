// 設定のダイアログの「見た目」の面。テーマの見本の札と、いつも開いた「カスタムの色」（色ごとの行：色見本の四角＋16進の読み出し）、背景の暗さ・パネルのぼかし・パネルの濃さの範囲入力を置く。
// 色の読み書きは `ScreenNavSettings.colors` と `themeId`・`onChooseTheme`（`useAppearanceColor`）のまま。

import { useId, type ReactElement } from "react"

import { BLUR_RANGE, FILL_RANGE } from "../../../../../shared/session/gear-preference.ts"
import { VEIL_PERCENT_RANGE } from "../../../../domain/appearance-adjust.ts"
import { APPEARANCE_THEMES } from "../../../../domain/appearance-color.ts"
import { Surface } from "../../../ui/surface/surface.tsx"
import { Text } from "../../../ui/text/text.tsx"
import type { ScreenNavSettingsItem, SettingItemKey } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings-look.module.css"
import { ScreenNavSettingsRow } from "./screen-nav-settings-row.tsx"
import rowStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

export function ScreenNavSettingsLookFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const { adjust } = settings
  const fieldId = useId()

  return (
    <>
      <div className={styles["presets"]} role="group" aria-label="テーマ">
        {APPEARANCE_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={styles["preset"]}
            aria-pressed={settings.themeId === theme.id}
            onClick={() => {
              settings.onChooseTheme(theme)
            }}
          >
            <span
              className={styles["preset-sample"]}
              style={{ backgroundColor: theme.ground, color: theme.ink }}
            >
              <i className={styles["preset-surface"]} style={{ backgroundColor: theme.surface }}>
                領域
              </i>
              {theme.name}
            </span>
            {theme.id === "night" ? "夜（既定）" : theme.name}
          </button>
        ))}
      </div>
      <div role="group" aria-labelledby={`${fieldId}-custom`}>
        <p id={`${fieldId}-custom`} className={styles["custom-heading"]}>
          カスタムの色
          <span className={styles["custom-note"]}>地・領域・字の3色を 16 進で決める</span>
        </p>
        {settings.colors.map((color) => (
          <ScreenNavSettingsRow
            key={color.key}
            itemKey={`color-${color.key}`}
            item={settings.items[`color-${color.key}`]}
            name={<label htmlFor={`${fieldId}-${color.key}`}>{color.label}</label>}
          >
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
          </ScreenNavSettingsRow>
        ))}
      </div>
      <RangeRow
        itemKey="veil"
        item={settings.items.veil}
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
        itemKey="blur"
        item={settings.items.blur}
        id={`${fieldId}-blur`}
        label="パネルのぼかし"
        range={BLUR_RANGE}
        value={adjust.blur}
        readout={`${adjust.blur}px`}
        onChange={adjust.onChangeBlur}
      />
      <RangeRow
        itemKey="fill"
        item={settings.items.fill}
        id={`${fieldId}-fill`}
        label="パネルの濃さ"
        range={FILL_RANGE}
        value={adjust.fill}
        readout={`${adjust.fill}%`}
        onChange={adjust.onChangeFill}
      />
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
  readonly itemKey: SettingItemKey
  readonly item: ScreenNavSettingsItem
  readonly id: string
  readonly label: string
  readonly range: { readonly min: number; readonly max: number }
  readonly value: number
  readonly readout: string
  readonly onChange: (value: number) => void
}): ReactElement {
  return (
    <ScreenNavSettingsRow
      itemKey={props.itemKey}
      item={props.item}
      name={<label htmlFor={props.id}>{props.label}</label>}
    >
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
    </ScreenNavSettingsRow>
  )
}
