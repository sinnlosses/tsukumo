// キャラクター画面の表情のカード1枚（docs/screen-design.md 13.6）。
//
// - 立ち絵がある表情: 立ち絵と名前。**右上の「差し替える」「消す」のアイコンは、カードに乗せた
//   とき・カードの中にフォーカスがあるときだけ出す**（`:hover` / `:focus-within`。キーボードでも
//   Tab で口に入ると出る）。`default` には「いつもの顔」の札を添える
// - 立ち絵がまだ無い表情: **その表情の名前を書いた点線の空欄**。枠そのものが選ぶ口になる
//
// どちらのカードにも画像を落とせる（落とすと差し替え・足す）。出し分けは
// `hooks/use-character-edit.ts` が畳んだ値のとおりで、判定を持たない。

import { type DragEvent, type ReactElement } from "react"

import { Portrait } from "../../../components/portrait.tsx"
import styles from "../character-screen.module.css"
import { type PortraitCardModel } from "../hooks/use-character-edit.ts"
import { PlusIcon, TrashIcon, UploadIcon } from "./action-icon.tsx"

/**
 * `<input type="file">` に出す受け付ける種類。**中身の検証はサーバ側**
 * （`src/shared/portrait-image.ts`）で、ここは選ぶときの絞り込みだけ。
 */
const PORTRAIT_FILE_ACCEPT = ".svg,.png,.gif"

/** 空欄のカードの名前の下に添える字。 */
const BLANK_HINT = "選ぶか、画像をここにドロップ"

export function PortraitCard(props: {
  readonly card: PortraitCardModel
  readonly disabled: boolean
}): ReactElement {
  const { card, disabled } = props

  // 画像を落とせるのは変えられるパックだけ（`preventDefault` しない ＝ 落とせない）。
  const onDragOver = (event: DragEvent): void => {
    if (!disabled) {
      event.preventDefault()
    }
  }
  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!disabled && file !== undefined) {
      card.onDropFile(file)
    }
  }

  const fileInput = (
    <input
      type="file"
      className={styles["character-card-file"]}
      aria-label={card.pickAriaLabel}
      accept={PORTRAIT_FILE_ACCEPT}
      disabled={disabled}
      onChange={(event) => {
        card.onPick(event.currentTarget)
      }}
    />
  )

  if (card.image.kind === "blank") {
    return (
      <label
        className={`${styles["character-card"]} ${styles["character-card-blank"]}`}
        data-expression={card.expression}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span className={styles["character-card-plus"]}>
          <PlusIcon />
        </span>
        <span className={styles["character-card-blank-label"]}>{card.label}</span>
        <span className={styles["character-card-blank-hint"]}>{BLANK_HINT}</span>
        {fileInput}
      </label>
    )
  }

  return (
    <figure
      className={styles["character-card"]}
      data-expression={card.expression}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={styles["character-card-stage"]}>
        <Portrait
          url={card.image.url}
          accent={card.image.accent}
          altText={card.label}
          expression={card.expression}
          outfit={card.image.outfit}
          motion={undefined}
          className={styles["character-card-portrait"]}
        />
      </div>
      <figcaption className={styles["character-card-label"]}>{card.label}</figcaption>
      {card.badge.kind === "shown" ? (
        <span className={styles["character-card-badge"]}>{card.badge.text}</span>
      ) : null}
      <div className={styles["character-card-actions"]}>
        {/* 見える字は無い（アイコンだけ）。**どの表情のことかは読み上げに残す**ので、
            `<input>` 側に aria-label を置き、`title` で乗せたときの名前を出す。 */}
        <label className={styles["character-card-action"]} title="差し替える">
          <UploadIcon />
          {fileInput}
        </label>
        {card.clear.kind === "shown" ? (
          <button
            type="button"
            className={`${styles["character-card-action"]} ${styles["character-card-action-danger"]}`}
            aria-label={card.clear.ariaLabel}
            title="消す"
            disabled={disabled}
            onClick={card.clear.onClear}
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>
    </figure>
  )
}
