// 帯の右端の歯車と、押すと開く**設定**のポップオーバー（docs/design.md 13.6 / 13.9「設定の
// 歯車」）。ロジックは `hooks/use-settings.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// **区切りの見出し + ラベルと操作子の2列**（13.9 が指す設定のモックの形）。群は「画面の色」・
// 「新しいセッションの既定」・「書き上げる演出の速さ」の3つ。
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
import { REVEAL_SPEED_LABELS } from "../../../lib/reveal-speed.ts"
import { type ScreenNavSettings } from "../hooks/use-settings.ts"
import styles from "../screen-nav.module.css"

export type ScreenNavSettingsProps = {
  readonly settings: ScreenNavSettings
  /** この器の歯車の DOM（Esc で閉じたときにフォーカスを戻す先。`use-settings.ts` が持つ）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
}

/** 読み上げに渡す名前（歯車は絵だけなので、名前は `aria-label` と `title` で渡す）。 */
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

/** 「書き上げる演出の速さ」の `<select>` に出す選択肢（`REVEAL_SPEED_LABELS` の並びのまま）。 */
const REVEAL_SPEED_OPTIONS = REVEAL_SPEED_LABELS.map(([value, label]) => ({ value, label }))

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
        <GearIcon />
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
          <p className={styles["screen-nav-settings-heading"]}>書き上げる演出の速さ</p>
          <div className={styles["screen-nav-settings-row"]}>
            <label htmlFor={`${fieldId}-reveal-speed`}>速さ</label>
            <Select
              id={`${fieldId}-reveal-speed`}
              ariaLabel="書き上げる演出の速さ"
              className={styles["screen-nav-settings-select"] ?? ""}
              value={settings.revealSpeed.value}
              disabled={false}
              title={undefined}
              options={REVEAL_SPEED_OPTIONS}
              onChange={settings.revealSpeed.onChange}
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

/**
 * 歯車の絵（見本の `<header>` の線画。docs/design.md 13.9「設定の歯車」）。
 * 字の「⚙」はフォントによって大きさも太さも揃わないので、仕事 / 雑談のトグルと同じく
 * `aria-hidden` のインライン SVG + `currentColor` で描く。
 */
function GearIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
