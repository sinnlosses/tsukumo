// キャラクター画面の主役、**立ち絵の並びと差し色**（`docs/design.md` 13.6 / 7.1）。
// **立ち絵そのものが差し替えの口になる** — 表情ごとに1枚のカードを `EXPRESSIONS` の順に並べ、
// カードの中で「差し替える」「消す」を出す。立ち絵が無い表情は点線の枠の空きにラベルと
// 「選ぶ」だけを出す（大きさと枠は `character-screen.module.css`）。
//
// 送るのは `set-portrait` / `clear-portrait` / `set-outfit-accent` の3つで、**書き込み先と
// 反映はサーバ側**（`src/adapter/character-edit.ts` → `character-changed`）。ここは選んだ画像を
// data URL にして渡すだけで、素材をブラウザ側に持ち続けない。
//
// **`default` には消す口を出さない**（立ち絵が必ず要る1つ。
// `src/shared/expression.ts` の `REQUIRED_EXPRESSIONS`。送られてきても
// `src/shared/command.ts` のスキーマが弾く）。
//
// **16進の色をここに書かない**（差し色はキャラクター定義の値で、定義に無い衣装の初期値は
// `--accent` から読む。`appearance-color.ts` の `readAccentColor`）。
//
// 差し色を引きずっている間は、**見た目（この立ち絵の `accent` と `<input>` の表示）だけ
// その場で更新し、`set-outfit-accent` の送信は `useDebouncedCallback` で 200ms まとめる**
// （`src/adapter/character-edit.ts` が送信のたびに `character.json` を書き直すため）。

import { useState, type ReactElement } from "react"

import { resolveExpressionLabel, resolveOutfitAccent } from "../../../shared/character.ts"
import {
  type Expression,
  EXPRESSIONS,
  isRemovableExpression,
  type Outfit,
  OUTFITS,
} from "../../../shared/expression.ts"
import { Portrait } from "../../components/portrait.tsx"
import { readDataUrl } from "../../lib/data-url.ts"
import { useDebouncedCallback } from "../../lib/debounce.ts"
import { useSession } from "../../stores/session.tsx"
import { readAccentColor } from "./appearance-color.ts"
import styles from "./character-screen.module.css"

/**
 * `<input type="file">` に出す受け付ける種類。**中身の検証はサーバ側**
 * （`src/shared/portrait-image.ts`）で、ここは選ぶときの絞り込みだけ。
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

/** 差し色の送信をまとめる間隔。ドラッグ中の1回1回を送らず、離れてから1回にする。 */
const OUTFIT_ACCENT_DEBOUNCE_MS = 200

export function CharacterEdit(): ReactElement | null {
  const { state, dispatch } = useSession()
  // 引きずっている間だけ見た目を先に進める上書き（衣装ごと）。**サーバへ送るのは
  // `sendOutfitAccent` 側でまとめる**ので、ここは表示専用（`docs/coding-standards.md`
  // 「useEffect の代わりに使うもの」の「利用者の操作で起きること」＝イベントハンドラで足す）。
  const [pendingAccents, setPendingAccents] = useState<Partial<Record<Outfit, string>>>({})
  const sendOutfitAccent = useDebouncedCallback<Outfit, string>((outfit, color) => {
    dispatch({ type: "set-outfit-accent", outfit, color })
  }, OUTFIT_ACCENT_DEBOUNCE_MS)

  const character = state.character
  // まだ `character-changed` が届いていない（接続直後の一瞬）。口を出すものが決まらない。
  if (character === undefined) {
    return null
  }
  const disabled = !character.editable
  const accent =
    pendingAccents[GALLERY_OUTFIT] ??
    resolveOutfitAccent(character.outfitAccents, GALLERY_OUTFIT) ??
    readAccentColor()

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
      {disabled ? <p className={styles["character-screen-note"]}>{NOT_EDITABLE_NOTE}</p> : null}
      <div className={styles["character-gallery"]}>
        {EXPRESSIONS.map((expression) => {
          const label = resolveExpressionLabel(character.expressions, expression)
          const url = character.portraits[expression]
          return (
            <div className={styles["character-gallery-card"]} key={expression}>
              {url === undefined ? (
                <span className={styles["character-gallery-blank"]} />
              ) : (
                <Portrait
                  url={url}
                  accent={accent}
                  altText={label}
                  expression={expression}
                  outfit={GALLERY_OUTFIT}
                  motion={undefined}
                  className={styles["character-gallery-portrait"]}
                />
              )}
              <span className={styles["character-gallery-label"]}>{label}</span>
              {/* 見える字は「差し替える」「選ぶ」だけ（カードが狭い）。**どの表情のことかは
                  読み上げに残す**ので、`<input>` 側に aria-label を置く。 */}
              <label className={styles["character-gallery-pick"]}>
                {url === undefined ? "選ぶ" : "差し替える"}
                <input
                  type="file"
                  className={styles["character-gallery-file"]}
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
                  className={styles["character-gallery-clear"]}
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
      <fieldset className={styles["character-screen-fieldset"]}>
        <legend>差し色</legend>
        <div className={styles["character-screen-row"]}>
          {OUTFITS.map((outfit) => {
            const inputId = `character-outfit-accent-${outfit}`
            return (
              <div className={styles["character-screen-field"]} key={outfit}>
                <label htmlFor={inputId}>{OUTFIT_LABELS[outfit]}</label>
                <input
                  id={inputId}
                  type="color"
                  disabled={disabled}
                  value={
                    pendingAccents[outfit] ??
                    resolveOutfitAccent(character.outfitAccents, outfit) ??
                    readAccentColor()
                  }
                  onChange={(event) => {
                    const color = event.target.value
                    setPendingAccents((current) => ({ ...current, [outfit]: color }))
                    sendOutfitAccent(outfit, color)
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
