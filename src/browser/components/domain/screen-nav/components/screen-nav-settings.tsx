// 設定の面のうち、セッションの既定・演出・タスクの実行の中身。面の表は `FACES`。
// id は `useId()` でこの器ごとに振る（`<label for>` が指す先が重ならないようにする）。

import { useId, type ReactElement } from "react"

import { isSessionDefaultPermissionMode } from "../../../../../shared/session/session-default.ts"
import { EFFORT_PLACEHOLDER_VALUE } from "../../../../domain/effort-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../../domain/permission-mode-label.ts"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import {
  RunSettingName,
  effortSelectOptions,
  modelSelectOptions,
  permissionModeSelectOptions,
} from "../../../../features/run-setting/components/run-setting-option.tsx"
import {
  RunSettingSelect,
  type RunSettingSelectOption,
} from "../../../../features/run-setting/components/run-setting-select.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { useLaunchSkillOptions } from "../hooks/use-launch-skill-setting.ts"
import type { ScreenNavSettings } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
}

/** 既定の吊り札に出す許可モード。「全部許す」は既定には選べないので落とす（帯の吊り札からはその都度選べる）。 */
const SESSION_DEFAULT_PERMISSION_MODES = PERMISSION_MODE_LABELS.map(([value]) => value).filter(
  isSessionDefaultPermissionMode,
)

const REVEAL_SPEED_OPTIONS = REVEAL_SPEED_LABELS.map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

/** セッションの既定の面（見出しなし）。 */
export function ScreenNavSettingsSessionDefaultFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-default-model`}>モデル</label>
        <RunSettingSelect
          id={`${fieldId}-default-model`}
          ariaLabel="新しいセッションの既定のモデル"
          heading="モデル"
          value={settings.sessionDefault.model}
          options={modelSelectOptions(settings.sessionDefault.modelEffortSupport)}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.sessionDefault.onChangeModel}
        />
      </HStack>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-default-effort`}>effort</label>
        <RunSettingSelect
          id={`${fieldId}-default-effort`}
          ariaLabel="新しいセッションの既定の effort"
          heading="effort"
          value={
            settings.sessionDefault.effort.kind === "known"
              ? settings.sessionDefault.effort.value
              : EFFORT_PLACEHOLDER_VALUE
          }
          options={effortSelectOptions(settings.sessionDefault.effort)}
          disabled={settings.sessionDefault.effort.kind !== "known"}
          danger={false}
          rail={false}
          layout="row"
          mouth="field"
          title={
            settings.sessionDefault.effort.kind === "known"
              ? undefined
              : settings.sessionDefault.effort.reason
          }
          dot="none"
          onChange={settings.sessionDefault.onChangeEffort}
        />
      </HStack>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-default-permission-mode`}>許可モード</label>
        <RunSettingSelect
          id={`${fieldId}-default-permission-mode`}
          ariaLabel="新しいセッションの既定の許可モード"
          heading="許可モード"
          value={settings.sessionDefault.permissionMode}
          options={permissionModeSelectOptions(SESSION_DEFAULT_PERMISSION_MODES)}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.sessionDefault.onChangePermissionMode}
        />
      </HStack>
    </>
  )
}

/** 演出の面（見出しなし）。 */
export function ScreenNavSettingsRevealFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-reveal-speed`}>書き上げる速さ</label>
        <RunSettingSelect
          id={`${fieldId}-reveal-speed`}
          ariaLabel="書き上げる演出の速さ"
          heading="書き上げる速さ"
          value={settings.revealSpeed.value}
          options={REVEAL_SPEED_OPTIONS}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.revealSpeed.onChange}
        />
      </HStack>
    </>
  )
}

/** タスクの実行の面（見出しなし）。起動スキルを入口のスキルの一覧から選ぶ。 */
export function ScreenNavSettingsLaunchSkillFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()
  const options = useLaunchSkillOptions(settings.launchSkill.value)

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-launch-skill`}>起動するスキル</label>
        <RunSettingSelect
          id={`${fieldId}-launch-skill`}
          ariaLabel="起動するスキル"
          heading="起動するスキル"
          value={settings.launchSkill.value}
          options={options.map((option): RunSettingSelectOption => ({
            value: option.value,
            disabled: false,
            icon: undefined,
            row: <RunSettingName danger={false}>{option.label}</RunSettingName>,
          }))}
          disabled={false}
          danger={false}
          rail={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.launchSkill.onChange}
        />
      </HStack>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-notice"]}
      >
        タスクの実行で呼ぶスキル。未設定なら「タスク GH-xxxx を進めて」と送る。
      </Text>
    </>
  )
}
