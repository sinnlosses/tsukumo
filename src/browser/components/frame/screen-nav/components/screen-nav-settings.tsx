// 設定の面のうち、セッションの既定・演出・タスクの実行の中身。面の表は `FACES`。
// id は `useId()` でこの器ごとに振る（`<label for>` が指す先が重ならないようにする）。

import { useId, type ReactElement } from "react"

import type { BackgroundModelRole } from "../../../../../shared/session/background-model.ts"
import {
  SESSION_DEFAULT_PERMISSION_MODES,
  type FigurePreference,
} from "../../../../../shared/session/session-default.ts"
import { EFFORT_PLACEHOLDER_VALUE } from "../../../../domain/effort-label.ts"
import { MOTION_PREFERENCE_LABELS } from "../../../../domain/motion-preference.ts"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import {
  RunSettingName,
  effortSelectOptions,
  modelSelectOptions,
  permissionModeSelectOptions,
} from "../../../../features/run-setting/run-setting-option.tsx"
import {
  RunSettingSelect,
  type RunSettingSelectOption,
} from "../../../../features/run-setting/run-setting-select.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
import { useLaunchSkillOptions } from "../hooks/use-launch-skill-setting.ts"
import type { ScreenNavSettings } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
}

const REVEAL_SPEED_OPTIONS = REVEAL_SPEED_LABELS.map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

const MOTION_OPTIONS = MOTION_PREFERENCE_LABELS.map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

const FIGURE_PREFERENCE_LABELS = [
  ["chart", "図を置く"],
  ["text", "文を主にする"],
] as const satisfies readonly (readonly [FigurePreference, string])[]

const FIGURE_PREFERENCE_OPTIONS = FIGURE_PREFERENCE_LABELS.map(
  ([value, label]): RunSettingSelectOption => ({
    value,
    disabled: false,
    icon: undefined,
    row: <RunSettingName danger={false}>{label}</RunSettingName>,
  }),
)

const BACKGROUND_MODEL_LABELS = [
  ["recommendation", "おすすめ"],
  ["welcomeGreeting", "迎えの一言"],
  ["chatConsolidation", "雑談の記憶の整理"],
  ["characterGeneration", "キャラクターの生成"],
] as const satisfies readonly (readonly [BackgroundModelRole, string])[]

const WAITING_LINE_OPTIONS = (
  [
    ["1m", "1分"],
    ["2m", "2分"],
    ["5m", "5分"],
    ["off", "出さない"],
  ] as const satisfies readonly (readonly [string, string])[]
).map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

const PROGRESS_NUDGE_OPTIONS = (
  [
    ["3m", "3分"],
    ["5m", "5分"],
    ["10m", "10分"],
    ["off", "しない"],
  ] as const satisfies readonly (readonly [string, string])[]
).map(([value, label]): RunSettingSelectOption => ({
  value,
  disabled: false,
  icon: undefined,
  row: <RunSettingName danger={false}>{label}</RunSettingName>,
}))

/** セッションの既定の面（見出しなし）。下に裏方のモデルの群を並べる。 */
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
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.sessionDefault.onChangePermissionMode}
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
        <label htmlFor={`${fieldId}-default-figure-preference`}>図の既定</label>
        <RunSettingSelect
          id={`${fieldId}-default-figure-preference`}
          ariaLabel="新しいセッションの図の既定"
          heading="図の既定"
          value={settings.sessionDefault.figurePreference}
          options={FIGURE_PREFERENCE_OPTIONS}
          disabled={false}
          danger={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.sessionDefault.onChangeFigurePreference}
        />
      </HStack>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-heading"]}
      >
        裏方のモデル
      </Text>
      {BACKGROUND_MODEL_LABELS.map(([role, label]) => (
        <HStack
          key={role}
          element="div"
          name={{ kind: "none" }}
          gap="lg"
          align="center"
          justify="between"
          wrap="nowrap"
          className={styles["screen-nav-settings-row"]}
        >
          <label htmlFor={`${fieldId}-background-${role}`}>{label}</label>
          <RunSettingSelect
            id={`${fieldId}-background-${role}`}
            ariaLabel={`裏方のモデル（${label}）`}
            heading={label}
            value={settings.backgroundModels.values[role]}
            options={modelSelectOptions(settings.sessionDefault.modelEffortSupport)}
            disabled={false}
            danger={false}
            layout="list"
            mouth="field"
            title={undefined}
            dot="none"
            onChange={(value) => {
              settings.backgroundModels.onChange(role, value)
            }}
          />
        </HStack>
      ))}
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
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.revealSpeed.onChange}
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
        <label htmlFor={`${fieldId}-motion`}>動き</label>
        <RunSettingSelect
          id={`${fieldId}-motion`}
          ariaLabel="動きを減らすか"
          heading="動き"
          value={settings.motion.value}
          options={MOTION_OPTIONS}
          disabled={false}
          danger={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.motion.onChange}
        />
      </HStack>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-heading"]}
      >
        話しかける間合い
      </Text>
      <HStack
        element="div"
        name={{ kind: "none" }}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-waiting-line`}>待ちの一言</label>
        <RunSettingSelect
          id={`${fieldId}-waiting-line`}
          ariaLabel="話しかける間合い（待ちの一言）"
          heading="待ちの一言"
          value={settings.speakingPace.values.waitingLine}
          options={WAITING_LINE_OPTIONS}
          disabled={false}
          danger={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.speakingPace.onChangeWaitingLine}
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
        <label htmlFor={`${fieldId}-progress-nudge`}>進み具合の催促</label>
        <RunSettingSelect
          id={`${fieldId}-progress-nudge`}
          ariaLabel="話しかける間合い（進み具合の催促）"
          heading="進み具合の催促"
          value={settings.speakingPace.values.progressNudge}
          options={PROGRESS_NUDGE_OPTIONS}
          disabled={false}
          danger={false}
          layout="list"
          mouth="field"
          title={undefined}
          dot="none"
          onChange={settings.speakingPace.onChangeProgressNudge}
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
