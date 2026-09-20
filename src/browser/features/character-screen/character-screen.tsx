// キャラクター画面（`#character`。`docs/design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// パックの持ち物（立ち絵・差し色。`<CharacterEdit>`）が上、利用者の設定（画面の色3つ）が下。
//
// **戻る口は左上**「← 会話へ戻る」。隠れている間も会話は進み続けるので、**答え待ちが来たら
// その右に印を出す**（色だけにしない。`--state-warn` と「答え待ち」の字）。
//
// 画面の色は `localStorage`（`appearance-color.ts`）。**保存済みの上書きを反映する1回は
// 入口（`src/browser/main.tsx`）が済ませている** — この画面は開かれるまでマウントされないので、
// ここで反映すると開くまで色が戻らない。
//
// 色を引きずっている間、`documentElement` への反映（見た目）は `onChange` のたびそのまま行い、
// `localStorage` への書き込みだけ `useDebouncedCallback` で 200ms まとめる（離れて書き込みが
// 落ち着いた1回にする）。

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

/** 答え待ちの印（`state.pending` が空でないとき）。**色だけにしない**ので字も出す。 */
const PENDING_NOTE = "答え待ち"

/** 画面の色の書き込みをまとめる間隔。 */
const APPEARANCE_COLOR_DEBOUNCE_MS = 200

export function CharacterScreen(): ReactElement {
  const character = useSessionSelector((session) => session.state.character)
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
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
  }

  return (
    <div className={styles["character-screen"]}>
      <div className={styles["character-screen-bar"]}>
        <a className={styles["character-screen-back"]} href={screenHash("conversation")}>
          ← 会話へ戻る
        </a>
        {pendingActive ? (
          <span className={styles["character-screen-pending"]}>{PENDING_NOTE}</span>
        ) : null}
      </div>
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
                  value={readCurrentColor(field.key)}
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
