// キャラクター画面の立ち絵のカード1枚（docs/design.md 13.6）。**立ち絵そのものが差し替えの口に
// なる** — 立ち絵がある表情は絵と「差し替える」「消す」、無い表情は点線の枠の空きにラベルと
// 「選ぶ」だけを出す（大きさと枠は `character-screen.module.css`）。出し分けは
// `hooks/use-character-edit.ts` が畳んだ値のとおりで、判定を持たない。

import { type ReactElement } from "react"

import { Portrait } from "../../../components/portrait.tsx"
import styles from "../character-screen.module.css"
import { type PortraitCardModel } from "../hooks/use-character-edit.ts"

/**
 * `<input type="file">` に出す受け付ける種類。**中身の検証はサーバ側**
 * （`src/shared/portrait-image.ts`）で、ここは選ぶときの絞り込みだけ。
 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

export function PortraitCard(props: {
  readonly card: PortraitCardModel
  readonly disabled: boolean
}): ReactElement {
  const { card, disabled } = props

  return (
    <div className={styles["character-gallery-card"]}>
      {card.image.kind === "blank" ? (
        <span className={styles["character-gallery-blank"]} />
      ) : (
        <Portrait
          url={card.image.url}
          accent={card.image.accent}
          altText={card.label}
          expression={card.expression}
          outfit={card.image.outfit}
          motion={undefined}
          className={styles["character-gallery-portrait"]}
        />
      )}
      <span className={styles["character-gallery-label"]}>{card.label}</span>
      {/* 見える字は「差し替える」「選ぶ」だけ（カードが狭い）。**どの表情のことかは
          読み上げに残す**ので、`<input>` 側に aria-label を置く。 */}
      <label className={styles["character-gallery-pick"]}>
        {card.pickText}
        <input
          type="file"
          className={styles["character-gallery-file"]}
          aria-label={card.pickAriaLabel}
          accept={PORTRAIT_FILE_ACCEPT}
          disabled={disabled}
          onChange={(event) => {
            card.onPick(event.currentTarget)
          }}
        />
      </label>
      {card.clear.kind === "shown" ? (
        <button
          type="button"
          className={styles["character-gallery-clear"]}
          aria-label={card.clear.ariaLabel}
          disabled={disabled}
          onClick={card.clear.onClear}
        >
          消す
        </button>
      ) : null}
    </div>
  )
}
