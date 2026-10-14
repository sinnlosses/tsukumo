// 設定の3つの面（色・セッションの既定・演出）と、3つを見出し付きで並べた中身（`ScreenNavSettingsBody`、狭い画面の引き出しの設定の面が置く）。
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
import { Button } from "../../../ui/button/button.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Text } from "../../../ui/text/text.tsx"
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

/** 設定の中身（3つの面を見出し付きで並べ、末尾に既定に戻す）。狭い画面の引き出しの設定の面が置く。 */
export function ScreenNavSettingsBody(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props

  return (
    <>
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-heading"]}
      >
        画面の色
      </Text>
      <ScreenNavSettingsColorFace settings={settings} />
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-heading"]}
      >
        新しいセッションの既定
      </Text>
      <ScreenNavSettingsSessionDefaultFace settings={settings} />
      <Text
        element="p"
        size="label"
        tone="ink-quiet"
        weight="inherit"
        className={styles["screen-nav-settings-heading"]}
      >
        書き上げる演出の速さ
      </Text>
      <ScreenNavSettingsRevealFace settings={settings} label="速さ" />
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <Button
          variant="link"
          size="label"
          pressed="none"
          disabled={settings.resetDisabled}
          ariaLabel={undefined}
          disclosure={{ kind: "none" }}
          ariaHasPopup={undefined}
          title={undefined}
          className={styles["screen-nav-settings-reset"]}
          onClick={settings.onReset}
        >
          既定に戻す
        </Button>
      </HStack>
    </>
  )
}

/** 画面の色の面（見出しなし）。 */
export function ScreenNavSettingsColorFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  return (
    <>
      {settings.colors.map((color) => (
        <HStack
          element="div"
          name={{ kind: "none" }}
          ref={undefined}
          gap="lg"
          align="center"
          justify="between"
          wrap="nowrap"
          className={styles["screen-nav-settings-row"]}
          key={color.key}
        >
          <label htmlFor={`${fieldId}-${color.key}`}>{color.label}</label>
          <input
            id={`${fieldId}-${color.key}`}
            type="color"
            value={color.value}
            onChange={(event) => {
              color.onChange(event.target.value)
            }}
          />
        </HStack>
      ))}
      {settings.colorNotice.kind === "shown" && (
        <Text
          element="p"
          size="label"
          tone="state-warn"
          weight="inherit"
          className={styles["screen-nav-settings-notice"]}
        >
          {settings.colorNotice.text}
        </Text>
      )}
    </>
  )
}

/** セッションの既定の面（見出しなし）。 */
export function ScreenNavSettingsSessionDefaultFace(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  const fieldId = useId()

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
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
        ref={undefined}
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
        ref={undefined}
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

/** 演出の面（見出しなし）。`label` は行の名前。 */
export function ScreenNavSettingsRevealFace(
  props: ScreenNavSettingsProps & { readonly label: string },
): ReactElement {
  const { settings, label } = props
  const fieldId = useId()

  return (
    <>
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="lg"
        align="center"
        justify="between"
        wrap="nowrap"
        className={styles["screen-nav-settings-row"]}
      >
        <label htmlFor={`${fieldId}-reveal-speed`}>{label}</label>
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
