// キャラクター画面の主役、**立ち絵の並びと差し色**（`docs/design.md` 13.6 / 7.1）。
// **立ち絵そのものが差し替えの口になる** — 表情ごとに1枚のカードを `EXPRESSIONS` の順に並べ、
// カードの中で「差し替える」「消す」を出す。立ち絵が無い表情は点線の枠の空きにラベルと
// 「選ぶ」だけを出す（大きさと枠は `src/ui/styles/character-screen.css`）。
//
// 送るのは `set-portrait` / `clear-portrait` / `set-outfit-accent` の3つで、**書き込み先と
// 反映はサーバ側**（`src/adapter/character-edit.ts` → `character-changed`）。ここは選んだ画像を
// data URL にして渡すだけで、素材をブラウザ側に持ち続けない。
//
// **`default` には消す口を出さない**（立ち絵が必ず要る1つ。
// `src/protocol/expression.ts` の `REQUIRED_EXPRESSIONS`。送られてきても
// `src/protocol/command.ts` のスキーマが弾く）。
//
// **16進の色をここに書かない**（差し色はキャラクター定義の値で、定義に無い衣装の初期値は
// `--accent` から読む。`appearance-color.ts` の `readAccentColor`）。

import { type ReactElement } from "react"

import { resolveExpressionLabel, resolveOutfitAccent } from "../../../protocol/character.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type Outfit,
  OUTFITS,
} from "../../../protocol/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { readDataUrl } from "../../lib/data-url.ts"
import { useSession } from "../../stores/session.tsx"
import { readAccentColor } from "./appearance-color.ts"

/**
 * `<input type="file">` に出す受け付ける種類。**中身の検証はサーバ側**
 * （`src/protocol/portrait-image.ts`）で、ここは選ぶときの絞り込みだけ。
 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

/**
 * 衣装のラベル。**モデルの重さ（装備の重さ）の言い方はどのキャラクターでも同じ**なので画面側が
 * 持つ（`docs/requirements.md` 4.3。表情のラベルはキャラクター定義から取る）。
 */
const OUTFIT_LABELS: Readonly<Record<Outfit, string>> = {
  default: "既定",
  light: "軽装（haiku）",
  normal: "通常装備（sonnet）",
  heavy: "戦闘配置（opus）",
}

/** 画面から変えられないパックのときに出す一言（理由は探索の順。`docs/design.md` 7.1）。 */
const NOT_EDITABLE_NOTE = "起動先の characters/local のパックは、画面からは変えられない"

/** カードの立ち絵に当てる衣装。並びでは衣装の違いを出さない（差し色の行がその役目）。 */
const GALLERY_OUTFIT: Outfit = "default"

export function CharacterEdit(): ReactElement | null {
  const { state, dispatch } = useSession()
  const character = state.character
  // まだ `character-changed` が届いていない（接続直後の一瞬）。口を出すものが決まらない。
  if (character === undefined) {
    return null
  }
  const disabled = !character.editable
  const accent = resolveOutfitAccent(character.outfitAccents, GALLERY_OUTFIT) ?? readAccentColor()

  /**
   * 選ばれた画像を data URL にして送る。**同じファイルをもう一度選べるように `value` を戻す**
   * （戻さないと `change` が起きない）。読めなかった回は何も送らない。
   */
  async function sendPortrait(expression: Expression, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    input.value = ""
    if (file === undefined) {
      return
    }

    const image = await readDataUrl(file)
    if (image !== undefined) {
      dispatch({ type: "set-portrait", expression, image })
    }
  }

  return (
    <>
      {disabled ? <p className="character-screen-note">{NOT_EDITABLE_NOTE}</p> : null}
      <div className="character-gallery">
        {EXPRESSIONS.map((expression) => {
          const label = resolveExpressionLabel(character.expressions, expression)
          const url = character.portraits[expression]
          return (
            <div className="character-gallery-card" key={expression}>
              {url === undefined ? (
                <span className="character-gallery-blank" />
              ) : (
                <Portrait
                  url={url}
                  accent={accent}
                  altText={label}
                  expression={expression}
                  outfit={GALLERY_OUTFIT}
                  motion={undefined}
                />
              )}
              <span className="character-gallery-label">{label}</span>
              {/* 見える字は「差し替える」「選ぶ」だけ（カードが狭い）。**どの表情のことかは
                  読み上げに残す**ので、`<input>` 側に aria-label を置く。 */}
              <label className="character-gallery-pick">
                {url === undefined ? "選ぶ" : "差し替える"}
                <input
                  type="file"
                  className="character-gallery-file"
                  aria-label={`${label}を${url === undefined ? "選ぶ" : "差し替える"}`}
                  accept={PORTRAIT_FILE_ACCEPT}
                  disabled={disabled}
                  onChange={(event) => {
                    void sendPortrait(expression, event.currentTarget)
                  }}
                />
              </label>
              {isRemovableExpression(expression) && url !== undefined ? (
                <button
                  type="button"
                  className="character-gallery-clear"
                  aria-label={`${label}を消す`}
                  disabled={disabled}
                  onClick={() => {
                    dispatch({ type: "clear-portrait", expression })
                  }}
                >
                  消す
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      <fieldset className="character-screen-fieldset">
        <legend>差し色</legend>
        <div className="character-screen-row">
          {OUTFITS.map((outfit) => {
            const inputId = `character-outfit-accent-${outfit}`
            return (
              <div className="character-screen-field" key={outfit}>
                <label htmlFor={inputId}>{OUTFIT_LABELS[outfit]}</label>
                <input
                  id={inputId}
                  type="color"
                  disabled={disabled}
                  value={resolveOutfitAccent(character.outfitAccents, outfit) ?? readAccentColor()}
                  onChange={(event) => {
                    dispatch({ type: "set-outfit-accent", outfit, color: event.target.value })
                  }}
                />
              </div>
            )
          })}
        </div>
      </fieldset>
    </>
  )
}
