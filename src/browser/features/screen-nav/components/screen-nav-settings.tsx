// 帯の右端の歯車と、押すと開く**設定**のポップオーバー（docs/design.md 13.6 / 13.9「設定の
// 歯車」）。ロジックは `hooks/use-settings.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// **区切りの見出し + ラベルと操作子の2列**（13.9 が指す設定のモックの形）。いまある群は
// 「画面の色」と「新しいセッションの既定」の2つで、後続が同じ器へ「書き上げる演出の速さ」を
// 足す。
//
// **同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く**（「いまの作業」の札と同じ
// 畳み方。どちらを出すかは CSS の `@media` が決める）。開閉の状態は1つの hook が持つので、
// どちらから押しても同じ面が開く——**id は `useId()` でこの器ごとに振る**（2箇所に描くため、
// `aria-controls` と `<label for>` が指す先が重ならないようにする）。

import { useId, type ReactElement, type RefObject } from "react"

import { isSessionDefaultPermissionMode } from "../../../../shared/session-default.ts"
import { Select } from "../../../components/select.tsx"
import { MODEL_LABELS } from "../../../lib/model-label.ts"
import { PERMISSION_MODE_LABELS } from "../../../lib/permission-mode-label.ts"
import { type ScreenNavSettings } from "../hooks/use-settings.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
  /** この器の歯車の DOM（Esc で閉じたときにフォーカスを戻す先。`use-settings.ts` が持つ）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

/** 歯車の字と、読み上げに渡す名前。 */
const GEAR_MARK = "⚙"
const SETTINGS_LABEL = "設定"

/** 既定の `<select>` に出すモデル（帯のドロップダウンと同じ4つ・同じ順）。 */
const MODEL_OPTIONS = MODEL_LABELS.map(([value, label]) => ({ value, label }))

/**
 * 既定の `<select>` に出す許可モード。**「全部許す」は落とす**（既定には選べない。
 * `src/shared/session-default.ts`）——帯のドロップダウンからはその都度選べる。
 */
const PERMISSION_MODE_OPTIONS = PERMISSION_MODE_LABELS.filter(([value]) =>
  isSessionDefaultPermissionMode(value),
).map(([value, label]) => ({ value, label }))

export function ScreenNavSettingsGear(props: ScreenNavSettingsProps): ReactElement {
  const { settings, toggleRef } = props
  const panelId = useId()
  const fieldId = useId()

  return (
    <div className={styles["screen-nav-settings"]}>
      <button
        type="button"
        ref={toggleRef}
        className={styles["screen-nav-settings-toggle"]}
        aria-expanded={settings.open}
        aria-controls={panelId}
        aria-label={SETTINGS_LABEL}
        title={SETTINGS_LABEL}
        onClick={settings.onToggle}
      >
        <span aria-hidden="true">{GEAR_MARK}</span>
      </button>
      {settings.open ? (
        <div
          id={panelId}
          className={styles["screen-nav-settings-panel"]}
          role="region"
          aria-label={SETTINGS_LABEL}
        >
          <p className={styles["screen-nav-settings-heading"]}>画面の色</p>
          {settings.colors.map((color) => (
            <div className={styles["screen-nav-settings-row"]} key={color.key}>
              <label htmlFor={`${fieldId}-${color.key}`}>{color.label}</label>
              <input
                id={`${fieldId}-${color.key}`}
                type="color"
                value={color.value}
                onChange={(event) => {
                  color.onChange(event.target.value)
                }}
              />
            </div>
          ))}
          <p className={styles["screen-nav-settings-heading"]}>新しいセッションの既定</p>
          <div className={styles["screen-nav-settings-row"]}>
            <label htmlFor={`${fieldId}-default-model`}>モデル</label>
            <Select
              id={`${fieldId}-default-model`}
              ariaLabel="新しいセッションの既定のモデル"
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.sessionDefault.model}
              disabled={false}
              title={undefined}
              options={MODEL_OPTIONS}
              onChange={settings.sessionDefault.onChangeModel}
            />
          </div>
          <div className={styles["screen-nav-settings-row"]}>
            <label htmlFor={`${fieldId}-default-permission-mode`}>許可モード</label>
            <Select
              id={`${fieldId}-default-permission-mode`}
              ariaLabel="新しいセッションの既定の許可モード"
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.sessionDefault.permissionMode}
              disabled={false}
              title={undefined}
              options={PERMISSION_MODE_OPTIONS}
              onChange={settings.sessionDefault.onChangePermissionMode}
            />
          </div>
          <div className={styles["screen-nav-settings-row"]}>
            <button
              type="button"
              className={styles["screen-nav-settings-reset"]}
              disabled={settings.resetDisabled}
              onClick={settings.onReset}
            >
              既定に戻す
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
