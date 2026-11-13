// 設定のダイアログの「知らせ」の面。通知・鈴の音を出すかと、出す出来事を選ぶ行を置く。
// 値の読み書きと許しの求め方は `ScreenNavSettings.alert`（`useAlertSetting`）が持ち、ここは行を描くだけ。

import { useId, type ReactElement } from "react"

import { RunSettingName } from "../../../../features/run-setting/run-setting-option.tsx"
import {
  RunSettingSelect,
  type RunSettingSelectOption,
} from "../../../../features/run-setting/run-setting-select.tsx"
import type { AlertEventKind, AlertSetting } from "../../../../stores/alert-setting.ts"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import rowStyles from "./screen-nav-settings.module.css"
import type { ScreenNavSettingsProps } from "./screen-nav-settings.tsx"

type SwitchRow = {
  readonly key: string
  readonly label: string
  readonly heading: string
  readonly on: string
  readonly off: string
  readonly read: (setting: AlertSetting) => boolean
  readonly write: (setting: AlertSetting, on: boolean) => AlertSetting
}

const EVENT_LABELS = [
  ["question", "質問が届いたとき"],
  ["permission", "許可を求めたとき"],
  ["failure", "失敗で止まったとき"],
  ["finished", "終わったとき"],
] as const satisfies readonly (readonly [AlertEventKind, string])[]

const ROWS = [
  {
    key: "notify",
    label: "通知する（このタブを見ていないときだけ）",
    heading: "通知",
    on: "する",
    off: "しない",
    read: (setting) => setting.notify,
    write: (setting, on) => ({ ...setting, notify: on }),
  },
  {
    key: "bell",
    label: "鈴の音",
    heading: "鈴の音",
    on: "鳴らす",
    off: "鳴らさない",
    read: (setting) => setting.bell,
    write: (setting, on) => ({ ...setting, bell: on }),
  },
  ...EVENT_LABELS.map(([kind, label]): SwitchRow => ({
    key: kind,
    label,
    heading: label,
    on: "知らせる",
    off: "知らせない",
    read: (setting) => setting.events[kind],
    write: (setting, on) => ({ ...setting, events: { ...setting.events, [kind]: on } }),
  })),
] as const satisfies readonly SwitchRow[]

export function ScreenNavSettingsAlertFace(props: ScreenNavSettingsProps): ReactElement {
  const { alert } = props.settings
  const fieldId = useId()

  return (
    <>
      {ROWS.map((row) => (
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="lg"
          align="center"
          justify="between"
          wrap="nowrap"
          className={rowStyles["screen-nav-settings-row"]}
          key={row.key}
        >
          <label htmlFor={`${fieldId}-${row.key}`}>{row.label}</label>
          <RunSettingSelect
            id={`${fieldId}-${row.key}`}
            ariaLabel={row.heading}
            heading={row.heading}
            value={row.read(alert.value) ? "on" : "off"}
            options={switchOptions(row)}
            disabled={false}
            danger={false}
            rail={false}
            layout="list"
            mouth="field"
            title={undefined}
            dot="none"
            onChange={(next) => {
              alert.onChange(row.write(alert.value, next === "on"))
            }}
          />
        </HStack>
      ))}
      {alert.notice.kind === "refused" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={rowStyles["screen-nav-settings-notice"]}
        >
          ブラウザが通知を断ったので、タブの題だけで知らせる
        </Text>
      )}
    </>
  )
}

function switchOptions(row: SwitchRow): readonly RunSettingSelectOption[] {
  const labels = [
    ["on", row.on],
    ["off", row.off],
  ] as const satisfies readonly (readonly [string, string])[]
  return labels.map(([value, label]): RunSettingSelectOption => ({
    value,
    disabled: false,
    icon: undefined,
    row: <RunSettingName danger={false}>{label}</RunSettingName>,
  }))
}
