// 設定のダイアログの「見た目」の面。会話の画面の器を選ぶ行、3色の見本の帯と、色ごとの行（色見本の四角＋16進の読み出し）を置く。
// 色の読み書きは `ScreenNavSettings.colors`（`useAppearanceColor`）のままで、帯はその値をそのまま描く。

import { useId, type ReactElement } from "react"

import type { AppearanceColorKey } from "../../../../domain/appearance-color.ts"
import { RunSettingName } from "../../../../features/run-setting/run-setting-option.tsx"
import {
  RunSettingSelect,
  type RunSettingSelectOption,
} from "../../../../features/run-setting/run-setting-select.tsx"
import type { Shell } from "../../../../stores/shell-mark.ts"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import styles from "./screen-nav-settings-look.module.css"
import rowStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

const SHELL_LABELS = [
  ["classic", "いまの画面"],
  ["stage", "舞台と紙（試験中）"],
] as const satisfies readonly (readonly [Shell, string])[]

const SHELL_OPTIONS = SHELL_LABELS.map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

const SINGLE_KEY_LABELS = [
  ["on", "使う"],
  ["off", "使わない"],
] as const satisfies readonly (readonly [string, string])[]

const SINGLE_KEY_OPTIONS = SINGLE_KEY_LABELS.map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

export function ScreenNavSettingsLookFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  function colorOf(key: AppearanceColorKey): string {
    return settings.colors.find((color) => color.key === key)?.value ?? "transparent"
  }

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={rowStyles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-shell`}>会話の画面</label>
        <RunSettingSelect
          id={`${fieldId}-shell`}
          ariaLabel="会話の画面の器"
          heading="会話の画面"
          value={settings.shell.value}
          options={SHELL_OPTIONS}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.shell.onChange}
        />
      </HStack>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={rowStyles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-single-keys`}>1字のキー（d・o・?）</label>
        <RunSettingSelect
          id={`${fieldId}-single-keys`}
          ariaLabel="1字のキー"
          heading="1字のキー"
          value={settings.singleKeys.value ? "on" : "off"}
          options={SINGLE_KEY_OPTIONS}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={(next) => {
            settings.singleKeys.onChange(next === "on")
          }}
        />
      </HStack>
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
