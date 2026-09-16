// 「見た目」の引き出しの中の、**キャラクターの立ち絵と差し色を差し替える口**
// （`docs/design.md` 7.1 / 13.6）。**常設の要素は1つも増えない** — 引き出し（`<dialog>`）の中に
// 入るので、閉じている間は画面に出ているボタンの数が変わらない（13.1 原則2）。
//
// 送るのは `set-portrait` / `clear-portrait` / `set-outfit-accent` の3つで、**書き込み先と
// 反映はサーバ側**（`src/core/character-edit.ts` → `character-changed`）。ここは選んだ画像を
// data URL にして渡すだけで、素材をブラウザ側に持ち続けない。
//
// **`default` と `working` には消す口を出さない**（立ち絵が必ず要る2つ。
// `src/protocol/expression.ts` の `REQUIRED_EXPRESSIONS`。送られてきても
// `src/protocol/command.ts` のスキーマが弾く）。
//
// **16進の色をここに書かない**（差し色はキャラクター定義の値で、定義に無い衣装の初期値は
// `--accent` から読む。`appearance-color.ts` の `readAccentColor`）。

import { type ReactElement } from "react"

import { resolveExpressionLabel, resolveOutfitAccent } from "../../protocol/character.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type Outfit,
  OUTFITS,
} from "../../protocol/expression.ts"
import { useSession } from "../app.tsx"
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

export function CharacterEdit(): ReactElement | null {
  const { state, dispatch } = useSession()
  const character = state.character
  // まだ `character-changed` が届いていない（接続直後の一瞬）。口を出すものが決まらない。
  if (character === undefined) {
    return null
  }
  const disabled = !character.editable

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
      {disabled ? <p className="appearance-note">{NOT_EDITABLE_NOTE}</p> : null}
      <fieldset className="appearance-fieldset">
        <legend>立ち絵</legend>
        {EXPRESSIONS.map((expression) => {
          const inputId = `appearance-portrait-${expression}`
          const label = resolveExpressionLabel(character.expressions, expression)
          return (
            <div className="appearance-field" key={expression}>
              <label htmlFor={inputId}>{label}</label>
              <span className="appearance-portrait-controls">
                <input
                  id={inputId}
                  type="file"
                  className="appearance-portrait-file"
                  accept={PORTRAIT_FILE_ACCEPT}
                  disabled={disabled}
                  onChange={(event) => {
                    void sendPortrait(expression, event.currentTarget)
                  }}
                />
                {isRemovableExpression(expression) &&
                character.portraits[expression] !== undefined ? (
                  <button
                    type="button"
                    className="appearance-portrait-clear"
                    // 見える字は「消す」だけ（行が狭い）。**どの表情を消すのかは読み上げに残す。**
                    aria-label={`${label}を消す`}
                    disabled={disabled}
                    onClick={() => {
                      dispatch({ type: "clear-portrait", expression })
                    }}
                  >
                    消す
                  </button>
                ) : null}
              </span>
            </div>
          )
        })}
      </fieldset>
      <fieldset className="appearance-fieldset">
        <legend>差し色</legend>
        {OUTFITS.map((outfit) => {
          const inputId = `appearance-outfit-accent-${outfit}`
          return (
            <div className="appearance-field" key={outfit}>
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
      </fieldset>
    </>
  )
}

/**
 * 選ばれたファイルを data URL にする。**読めなかったときは undefined**（立ち絵が変わらないだけで、
 * 画面は落ちない）。
 */
function readDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : undefined)
    }
    reader.onerror = () => {
      resolve(undefined)
    }
    reader.readAsDataURL(file)
  })
}
