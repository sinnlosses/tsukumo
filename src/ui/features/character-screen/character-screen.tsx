// キャラクター画面（`#character`。`docs/design.md` 13.6 / 6.1）。**会話の画面と入れ替わる**
// （重ねない。出す画面を選ぶのは入口の `<Root>`）。腰を据えて整えるものだけをここに置く:
// パックの持ち物（立ち絵・差し色。`<CharacterEdit>`）が上、利用者の設定（画面の色3つ）が下。
//
// **戻る口は左上**「← 会話へ戻る」。隠れている間も会話は進み続けるので、**答え待ちが来たら
// その右に印を出す**（色だけにしない。`--state-warn` と「答え待ち」の字）。
//
// 画面の色は `localStorage`（`appearance-color.ts`）。**保存済みの上書きを反映する1回は
// 入口（`src/ui/main.tsx`）が済ませている** — この画面は開かれるまでマウントされないので、
// ここで反映すると開くまで色が戻らない。

import { useState, type ReactElement } from "react"

import { screenHash } from "../../stores/screen.tsx"
import { useSession } from "../../stores/session.tsx"
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

const COLOR_FIELDS = [
  { key: "ground", label: "画面の地" },
  { key: "surface", label: "領域の地" },
  { key: "ink", label: "字の色" },
] as const satisfies ReadonlyArray<{ readonly key: AppearanceColorKey; readonly label: string }>

/** 答え待ちの印（`state.pending` が空でないとき）。**色だけにしない**ので字も出す。 */
const PENDING_NOTE = "答え待ち"

export function CharacterScreen(): ReactElement {
  const { state } = useSession()
  // 上書きの正典は `localStorage`。反映（`documentElement`）は入口が済ませているので、
  // ここは「次の1色を足すための下地」として読むだけ。
  const [override, setOverride] = useState<AppearanceColorOverride>(loadAppearanceColorOverride)
  const character = state.character

  function handleColorChange(key: AppearanceColorKey, value: string): void {
    const next = changeAppearanceColor(override, key, value)
    applyAppearanceColorOverride(next)
    saveAppearanceColorOverride(next)
    setOverride(next)
  }

  return (
    <div className="character-screen">
      <div className="character-screen-bar">
        <a className="character-screen-back" href={screenHash("conversation")}>
          ← 会話へ戻る
        </a>
        {state.pending.length > 0 ? (
          <span className="character-screen-pending">{PENDING_NOTE}</span>
        ) : null}
      </div>
      <div className="character-screen-headline">
        {character === undefined ? null : (
          <>
            <h1 className="character-screen-label">{character.name ?? character.pack ?? ""}</h1>
            <span className="character-screen-pack">{character.pack}</span>
          </>
        )}
        <a className="character-screen-new" href={screenHash("character-create")}>
          新しく作る
        </a>
      </div>
      <CharacterEdit />
      <fieldset className="character-screen-fieldset">
        <legend>画面の色</legend>
        <div className="character-screen-row">
          {COLOR_FIELDS.map((field) => {
            const inputId = `character-color-${field.key}`
            return (
              <div className="character-screen-field" key={field.key}>
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
