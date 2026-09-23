// 帯の右端の歯車と、押すと開く**設定**のポップオーバー（docs/design.md 13.6 / 13.9「設定の
// 歯車」）。ロジックは `hooks/use-settings.ts`、ここは受け取った値をそのまま置く器
// （2章「機能の中を分ける」）。
//
// **区切りの見出し + ラベルと操作子の2列**（13.9 が指す設定のモックの形）。いまある群は
// 「画面の色」の1つだけで、後続が同じ器へ「新しいセッションの既定」と「書き上げる演出の
// 速さ」を足す。
//
// **同じ部品を広い画面の帯と狭い画面の「≡」の面の両方に置く**（「いまの作業」の札と同じ
// 畳み方。どちらを出すかは CSS の `@media` が決める）。開閉の状態は1つの hook が持つので、
// どちらから押しても同じ面が開く——**id は `useId()` でこの器ごとに振る**（2箇所に描くため、
// `aria-controls` と `<label for>` が指す先が重ならないようにする）。

import { useId, type ReactElement, type RefObject } from "react"

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
