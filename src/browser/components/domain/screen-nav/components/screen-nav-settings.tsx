// 帯の右端の歯車と、押すと開く設定のポップオーバー。
//
// 同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く（どちらを出すかは CSS の `@media` が決める）。
// 開閉の状態は1つの hook が持つので、どちらから押しても同じ面が開く。
// id は `useId()` でこの器ごとに振る（`aria-controls` と `<label for>` が指す先が重ならないようにする）。
// Esc の戻り先として歯車の DOM を預ける口（`settings.toggleRef`）も、2箇所ぶんを集めるコールバック ref。

import clsx from "clsx"
import { Settings } from "lucide-react"
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
import { TASK_OPERATION_LABELS } from "../domain/task-operation-label.ts"
import type { ScreenNavSettings } from "../hooks/use-settings.ts"
import shellStyles from "../screen-nav.module.css"
import { PROJECT_SETTINGS_LABEL } from "./project-settings-dialog.tsx"
import styles from "./screen-nav-settings.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
}

/** 読み上げに渡す名前（歯車は絵だけなので、名前は `aria-label` と `title` で渡す）。 */
const SETTINGS_LABEL = "設定"

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

const TASK_OPERATION_OPTIONS = TASK_OPERATION_LABELS.map(([value, label]) => ({
  value,
  label,
}))

export function ScreenNavSettingsGear(props: ScreenNavSettingsProps): ReactElement {
  const { settings } = props
  // 預け先はここで分解して受ける。
  // `settings.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `settings` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = settings
  const panelId = useId()
  const fieldId = useId()

  // `shellStyles` の class は見た目を持たず、`screen-nav.module.css` の `@media` の選択子を当てるためだけに重ねる。
  return (
    <div className={clsx(styles["screen-nav-settings"], shellStyles["screen-nav-settings"])}>
      <button
        type="button"
        ref={toggleRef}
        className={clsx(
          styles["screen-nav-settings-toggle"],
          shellStyles["screen-nav-settings-toggle"],
        )}
        aria-expanded={settings.open}
        aria-controls={panelId}
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
        onClick={settings.onToggle}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      {settings.open && (
        <div
          id={panelId}
          className={clsx(
            styles["screen-nav-settings-panel"],
            shellStyles["screen-nav-settings-panel"],
          )}
          role="region"
          aria-label={SETTINGS_LABEL}
        >
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"]}
          >
            画面の色
          </Text>
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
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"]}
          >
            新しいセッションの既定
          </Text>
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
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"]}
          >
            書き上げる演出の速さ
          </Text>
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
            <label htmlFor={`${fieldId}-reveal-speed`}>速さ</label>
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
          <Text
            element="p"
            size="label"
            tone="ink-quiet"
            weight="inherit"
            className={styles["screen-nav-settings-heading"]}
          >
            プロジェクト
          </Text>
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
            <label htmlFor={`${fieldId}-task-operation`}>タスク運用</label>
            <Select
              id={`${fieldId}-task-operation`}
              ariaLabel="タスク運用の使う・使わない"
              frameClassName={styles["screen-nav-settings-select-frame"]}
              className={styles["screen-nav-settings-select"]}
              value={settings.project.tasks.value}
              disabled={settings.project.tasks.disabled}
              title={settings.project.tasks.title}
              options={TASK_OPERATION_OPTIONS}
              onChange={settings.project.tasks.onChange}
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
            <Button
              variant="link"
              size="label"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup="dialog"
              title={undefined}
              className={styles["screen-nav-settings-reset"]}
              onClick={settings.project.onOpenDialog}
            >
              {PROJECT_SETTINGS_LABEL}を開く
            </Button>
          </HStack>
        </div>
      )}
    </div>
  )
}
