// 依頼に添えた画像の見せ方（`docs/requirements.md` 4.10「画面での見え方」）。**送る前は入力欄の
// 中の小さな札、送ったあとは依頼に付く控え**で、出す場所が3つ（入力欄・メインビューの依頼の
// 見出しの下・雑談の利用者の吹き出しの中）にまたがるので `components/` に置く。
//
// **札も控えも、押すと原寸を拡大して見られる**（`components/image-zoom.tsx`）。押せる場所は絵
// （ホバー・フォーカスで虫眼鏡が重なる。タッチ端末で虫眼鏡が見えていなくても、押せば同じに開く）
// で、札にはもう1つ `×`（外す）がある。原寸の出どころは2つで、
//
// - 札: 送る前なので原寸はブラウザのメモリにある（サーバへは取りに行かない）
// - 控え: 記録に載っているのは控えと id だけなので、**押したときに** id でサーバの棚から
//   取りに行く（`/prompt-image/<id>`。WebSocket のフレームには原寸を載せない）。棚は直近の
//   数枚しか持たないので、**取れなかったら（404）控えを拡大の面に出し、原寸はもう手放したと
//   1行添える**（ブラウザは棚の中身を知らないので、取りに行ってから決める）
//
// **1枚も無いときは何も描かない**ので、常設の枠にならない（`docs/design.md` 13.1 原則2）。

import { useState, type ReactElement } from "react"

import {
  type PromptImage,
  promptImagePath,
  type RecordedPromptImage,
} from "../../shared/prompt-image.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../../shared/session-socket.ts"
import { ImageZoom, type ImageZoomFallback } from "./image-zoom.tsx"
import styles from "./prompt-image.module.css"

/** 札にも控えにも同じ alt を付ける（中身は読めないので、そこに何があるかだけを伝える）。 */
const IMAGE_ALT = "添えた画像"

const ZOOM_LABEL = "この画像を拡大"
const REMOVE_LABEL = "この画像を外す"

/** 控えを押したが棚に原寸が残っていなかったときの1行（控えを代わりに出している理由）。 */
const RELEASED_NOTE = "原寸はもう手放したので、控えを拡大しています"

/** 札の原寸はブラウザのメモリにあり、読めないことが起きないので代わりを持たない。 */
const NO_FALLBACK = { kind: "none" } as const satisfies ImageZoomFallback

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
          fallback={NO_FALLBACK}
          onClose={() => setZoomedIndex(undefined)}
        />
      )}
    </>
  )
}

export type PromptImageThumbnailsProps = {
  /** 控えと、棚の原寸を指す id の組の並び（記録に残っているのはこれだけ）。 */
  readonly images: readonly RecordedPromptImage[]
}

/**
 * 送ったあとの控え（依頼の見出しの下・雑談の吹き出しの中）。押すと棚の原寸を拡大の面で開き、
 * 棚に残っていなければ控えを代わりに出す。
 */
export function PromptImageThumbnails(props: PromptImageThumbnailsProps): ReactElement | null {
  // 開いている控えの id（棚が振った UUID なので、同じ依頼の中でも重ならない）。
  const [zoomedId, setZoomedId] = useState<string | undefined>(undefined)

  if (props.images.length === 0) {
    return null
  }

  const zoomedImage = props.images.find((image) => image.id === zoomedId)

  return (
    <>
      <ul className={styles["prompt-images"]}>
        {props.images.map((image) => (
          <li className={styles["prompt-image-thumbnail"]} key={image.id}>
            <button
              type="button"
              className={styles["prompt-image-zoom"]}
              aria-label={ZOOM_LABEL}
              onClick={() => setZoomedId(image.id)}
            >
              <img className={styles["prompt-image"]} src={image.thumbnail} alt={IMAGE_ALT} />
              <ZoomIcon />
            </button>
          </li>
        ))}
      </ul>
      {zoomedImage !== undefined && (
        <ImageZoom
          key={zoomedImage.id}
          src={shelvedImageUrl(zoomedImage.id)}
          alt={IMAGE_ALT}
          fallback={{ kind: "substitute", src: zoomedImage.thumbnail, note: RELEASED_NOTE }}
          onClose={() => setZoomedId(undefined)}
        />
      )}
    </>
  )
}

/**
 * 棚の原寸を取りに行く URL。起動トークンは**このページの URL から**引き継ぐ
 * （`/repository-file` を引く入力欄の `@` 補完と同じ形）。
 */
function shelvedImageUrl(id: string): string {
  const token = new URL(window.location.href).searchParams.get(SESSION_TOKEN_QUERY_NAME) ?? ""
  return `${promptImagePath(id)}?${SESSION_TOKEN_QUERY_NAME}=${encodeURIComponent(token)}`
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
