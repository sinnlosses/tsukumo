// 依頼に添えた画像の見せ方（`docs/requirements.md` 4.10「画面での見え方」）。**送る前は入力欄の
// 中の小さな札、送ったあとは依頼に付く控え**で、出す場所が3つ（入力欄・メインビューの依頼の
// 見出しの下・雑談の利用者の吹き出しの中）にまたがるので `components/` に置く。
//
// **札は押すと原寸を拡大して見られる**（`components/image-zoom.tsx`。原寸は送るまでブラウザの
// メモリに既にあるので、サーバ側の仕組みは要らない）。押せる場所は絵（ホバー・フォーカスで
// 虫眼鏡が重なる。タッチ端末で虫眼鏡が見えていなくても、押せば同じに開く）と `×`（外す）の2つ。
// **控えはまだ押せない**（メインビューと雑談からの拡大は別のタスクで足す）。
//
// **1枚も無いときは何も描かない**ので、常設の枠にならない（`docs/design.md` 13.1 原則2）。

import { useState, type ReactElement } from "react"

import { type PromptImage } from "../../shared/prompt-image.ts"
import { ImageZoom } from "./image-zoom.tsx"
import styles from "./prompt-image.module.css"

/** 札にも控えにも同じ alt を付ける（中身は読めないので、そこに何があるかだけを伝える）。 */
const IMAGE_ALT = "添えた画像"

const ZOOM_LABEL = "この画像を拡大"
const REMOVE_LABEL = "この画像を外す"

export type PromptImageChipsProps = {
  readonly images: readonly PromptImage[]
  readonly onRemove: (index: number) => void
}

/** 送る前の札（`<textarea>` の上に並ぶ）。縮めた絵（押すと拡大）と、外す `×` を持つ。 */
export function PromptImageChips(props: PromptImageChipsProps): ReactElement | null {
  const [zoomedIndex, setZoomedIndex] = useState<number | undefined>(undefined)

  if (props.images.length === 0) {
    return null
  }

  const zoomedImage = zoomedIndex === undefined ? undefined : props.images[zoomedIndex]

  return (
    <>
      <ul className={styles["prompt-images"]}>
        {props.images.map((image, index) => (
          // 並びは末尾に積むか途中を外すかだけで、並べ替えは無い。
          <li className={styles["prompt-image-chip"]} key={index}>
            {/* ボタンの中にボタンを入れないので、絵を押すボタンと外す `×` は兄弟にして、
                `×` を絵の右上に重ねる（CSS 側）。 */}
            <button
              type="button"
              className={styles["prompt-image-zoom"]}
              aria-label={ZOOM_LABEL}
              onClick={() => setZoomedIndex(index)}
            >
              <img className={styles["prompt-image"]} src={image.thumbnail} alt={IMAGE_ALT} />
              <ZoomIcon />
            </button>
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
      {zoomedImage !== undefined && (
        <ImageZoom
          src={zoomedImage.full}
          alt={IMAGE_ALT}
          onClose={() => setZoomedIndex(undefined)}
        />
      )}
    </>
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

/** 虫眼鏡（札の絵にホバー・フォーカスで重ねる飾り）。キャラクターの外の道具の絵なのでコードに
    置く（原則4 の対象外。`speech-log.tsx` の `LogIcon` と同じ扱い）。 */
function ZoomIcon(): ReactElement {
  return (
    <svg
      className={styles["prompt-image-zoom-icon"]}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10 10l3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}
