// 依頼に添えた画像の見せ方（`docs/requirements.md` 4.10「画面での見え方」）。**送る前は入力欄の
// 中の小さな札、送ったあとは依頼に付く控え**で、出す場所が3つ（入力欄・メインビューの依頼の
// 見出しの下・雑談の利用者の吹き出しの中）にまたがるので `components/` に置く。
//
// **札も控えも押せない。** 拡大して見る面は作らない（原寸はもう誰も持っていないので、開くものが
// 無い。4.10）。押せるのは札の `×`（外す）だけ。
//
// **1枚も無いときは何も描かない**ので、常設の枠にならない（`docs/design.md` 13.1 原則2）。

import { type ReactElement } from "react"

import { type PromptImage } from "../../shared/prompt-image.ts"
import styles from "./prompt-image.module.css"

/** 札にも控えにも同じ alt を付ける（中身は読めないので、そこに何があるかだけを伝える）。 */
const IMAGE_ALT = "添えた画像"

const REMOVE_LABEL = "この画像を外す"

export type PromptImageChipsProps = {
  readonly images: readonly PromptImage[]
  readonly onRemove: (index: number) => void
}

/** 送る前の札（`<textarea>` の上に並ぶ）。縮めた絵と、外す `×` を持つ。 */
export function PromptImageChips(props: PromptImageChipsProps): ReactElement | null {
  if (props.images.length === 0) {
    return null
  }

  return (
    <ul className={styles["prompt-images"]}>
      {props.images.map((image, index) => (
        // 並びは末尾に積むか途中を外すかだけで、並べ替えは無い。
        <li className={styles["prompt-image-chip"]} key={index}>
          <img className={styles["prompt-image"]} src={image.thumbnail} alt={IMAGE_ALT} />
          <button
            type="button"
            className={styles["prompt-image-remove"]}
            aria-label={REMOVE_LABEL}
            onClick={() => {
              props.onRemove(index)
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

export type PromptImageThumbnailsProps = {
  /** 控えの data URL の並び（記録に残っているのはこれだけ）。 */
  readonly images: readonly string[]
}

/** 送ったあとの控え（依頼の見出しの下・雑談の吹き出しの中）。押せない。 */
export function PromptImageThumbnails(props: PromptImageThumbnailsProps): ReactElement | null {
  if (props.images.length === 0) {
    return null
  }

  return (
    <ul className={styles["prompt-images"]}>
      {props.images.map((thumbnail, index) => (
        <li className={styles["prompt-image-thumbnail"]} key={index}>
          <img className={styles["prompt-image"]} src={thumbnail} alt={IMAGE_ALT} />
        </li>
      ))}
    </ul>
  )
}
