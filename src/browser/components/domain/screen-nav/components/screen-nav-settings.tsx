// 設定の3つの面（色・セッションの既定・演出）と、3つを見出し付きで並べた中身（`ScreenNavSettingsBody`、狭い画面の引き出しの設定の面が置く）。
// id は `useId()` でこの器ごとに振る（`<label for>` が指す先が重ならないようにする）。

import { useId, type ReactElement } from "react"

import { isSessionDefaultPermissionMode } from "../../../../../shared/session/session-default.ts"
import { EFFORT_PLACEHOLDER_VALUE, effortLabel } from "../../../../domain/effort-label.ts"
import { MODEL_LABELS } from "../../../../domain/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../../domain/permission-mode-label.ts"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import { Button } from "../../../ui/button/button.tsx"
import { HStack } from "../../../ui/h-stack/h-stack.tsx"
import { Select } from "../../../ui/select/select.tsx"
import { Text } from "../../../ui/text/text.tsx"
import type { ScreenNavSettings } from "../hooks/use-settings.ts"
import styles from "./screen-nav-settings.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
}

/** 既定の `<select>` に出すモデル（帯のドロップダウンと同じ順）。 */
const MODEL_OPTIONS = MODEL_LABELS.map(([value, label]) => ({ value, label }))

/** 既定の `<select>` に出す許可モード。「全部許す」は既定には選べないので落とす（帯のドロップダウンからはその都度選べる）。 */
const PERMISSION_MODE_OPTIONS = PERMISSION_MODE_LABELS.filter(([value]) =>
  isSessionDefaultPermissionMode(value),
).map(([value, label]) => ({ value, label }))

const REVEAL_SPEED_OPTIONS = REVEAL_SPEED_LABELS.map(([value, label]) => ({
  value,
  label,
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
        <Select
          id={`${fieldId}-default-model`}
          ariaLabel="新しいセッションの既定のモデル"
          frameClassName={styles["screen-nav-settings-select-frame"]}
          className={styles["screen-nav-settings-select"]}
          value={settings.sessionDefault.model}
          disabled={false}
          title={undefined}
          options={MODEL_OPTIONS}
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
        {settings.sessionDefault.effort.kind === "known" ? (
          <Select
            id={`${fieldId}-default-effort`}
            ariaLabel="新しいセッションの既定の effort"
            frameClassName={styles["screen-nav-settings-select-frame"]}
            className={styles["screen-nav-settings-select"]}
            value={settings.sessionDefault.effort.value}
            disabled={false}
            title={undefined}
            options={settings.sessionDefault.effort.options.map((value) => ({
              value,
              label: effortLabel(value),
            }))}
            onChange={settings.sessionDefault.onChangeEffort}
          />
        ) : (
          <Select
            id={`${fieldId}-default-effort`}
            ariaLabel="新しいセッションの既定の effort"
            frameClassName={styles["screen-nav-settings-select-frame"]}
            className={styles["screen-nav-settings-select"]}
            value={EFFORT_PLACEHOLDER_VALUE}
            disabled={true}
            title={settings.sessionDefault.effort.reason}
            options={[{ value: EFFORT_PLACEHOLDER_VALUE, label: "—" }]}
            onChange={() => {}}
          />
        )}
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
        <Select
          id={`${fieldId}-default-permission-mode`}
          ariaLabel="新しいセッションの既定の許可モード"
          frameClassName={styles["screen-nav-settings-select-frame"]}
          className={styles["screen-nav-settings-select"]}
          value={settings.sessionDefault.permissionMode}
          disabled={false}
          title={undefined}
          options={PERMISSION_MODE_OPTIONS}
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
        <Select
          id={`${fieldId}-reveal-speed`}
          ariaLabel="書き上げる演出の速さ"
          frameClassName={styles["screen-nav-settings-select-frame"]}
          className={styles["screen-nav-settings-select"]}
          value={settings.revealSpeed.value}
          disabled={false}
          title={undefined}
          options={REVEAL_SPEED_OPTIONS}
          onChange={settings.revealSpeed.onChange}
        />
      </HStack>
    </>
  )
}
