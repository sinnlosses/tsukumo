// キャラクター画面（`#character`。`docs/design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// パックの持ち物（立ち絵・差し色。`<CharacterEdit>`）が上、利用者の設定（画面の色3つ）が下。
//
// **会話へ戻る口と答え待ちの印は、全画面の最上部の帯**（`features/screen-nav/`。13.9）に
// あるので、この画面は持たない。
//
// 画面の色は `localStorage`（`appearance-color.ts`）。**保存済みの上書きを反映する1回は
// 入口（`src/browser/main.tsx`）が済ませている** — この画面は開かれるまでマウントされないので、
// ここで反映すると開くまで色が戻らない。
//
// 色を引きずっている間、`documentElement` への反映（見た目）は `onChange` のたびそのまま行い、
// `localStorage` への書き込みだけ `useDebouncedCallback` で 200ms まとめる（離れて書き込みが
// 落ち着いた1回にする）。
//
// `<input type="color">` に出す表示値は `displayColor` に持つ。マウント時に一度だけ
// `readCurrentColor`（`getComputedStyle`）で読み、以降は**書いた値をそのまま state へ流す**
// （書く → 描画中に読み直す、を避ける。読みが描画のたびに起きない・書いた値と読み戻す値が
// ずれない、の両方を1つの形で満たす）。

import { useState, type ReactElement } from "react"

import { useDebouncedCallback } from "../../lib/debounce.ts"
import { screenHash } from "../../stores/screen.tsx"
import { useSessionSelector } from "../../stores/session.tsx"
import {
  applyAppearanceColorOverride,
  changeAppearanceColor,
  loadAppearanceColorOverride,
  readCurrentColor,
  saveAppearanceColorOverride,
  type AppearanceColorKey,
  type AppearanceColorOverride,
} from "./appearance-color.ts"
import { CharacterEdit } from "./character-edit.tsx"
import styles from "./character-screen.module.css"

const COLOR_FIELDS = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
] as const satisfies ReadonlyArray<{ readonly key: AppearanceColorKey; readonly label: string }>

/** 画面の色の書き込みをまとめる間隔。 */
const APPEARANCE_COLOR_DEBOUNCE_MS = 200

export function CharacterScreen(): ReactElement {
  const character = useSessionSelector((session) => session.state.character)
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
  // `<input>` に出す表示値。入口が反映済みの状態を、マウント時に1回だけ読んで持つ
  // （`readCurrentColor` を描画のたびに呼ばない）。
  const [displayColor, setDisplayColor] = useState<Record<AppearanceColorKey, string>>(() => ({
    ground: readCurrentColor("ground"),
    surface: readCurrentColor("surface"),
    ink: readCurrentColor("ink"),
  }))
  const saveOverride = useDebouncedCallback<AppearanceColorKey, AppearanceColorOverride>(
    (_key, value) => {
      saveAppearanceColorOverride(value)
    },
    APPEARANCE_COLOR_DEBOUNCE_MS,
  )

  function handleColorChange(key: AppearanceColorKey, value: string): void {
    const next = changeAppearanceColor(override, key, value)
    applyAppearanceColorOverride(next)
    setOverride(next)
    saveOverride(key, next)
    // 受け取られたときだけ表示値を進める（`next` は受け取らなければ `override` と同じ参照の
    // まま返る）。書いた値がそのまま documentElement に反映されるので、書き戻しを読み直さず
    // その値をそのまま表示値にできる。
    if (next !== override) {
      setDisplayColor((current) => ({ ...current, [key]: value }))
    }
  }

  return (
    <div className={styles["character-screen"]}>
      <div className={styles["character-screen-headline"]}>
        {character === undefined ? null : (
          <>
            <h1 className={styles["character-screen-label"]}>
              {character.name ?? character.pack ?? ""}
            </h1>
            <span className={styles["character-screen-pack"]}>{character.pack}</span>
          </>
        )}
        <a className={styles["character-screen-new"]} href={screenHash("character-create")}>
          新しく作る
        </a>
      </div>
      <CharacterEdit />
      <fieldset className={styles["character-screen-fieldset"]}>
        <legend>画面の色</legend>
        <div className={styles["character-screen-row"]}>
          {COLOR_FIELDS.map((field) => {
            const inputId = `character-color-${field.key}`
            return (
              <div className={styles["character-screen-field"]} key={field.key}>
                <label htmlFor={inputId}>{field.label}</label>
                <input
                  id={inputId}
                  type="color"
                  value={displayColor[field.key]}
                  onChange={(event) => {
                    handleColorChange(field.key, event.target.value)
                  }}
                />
              </div>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
