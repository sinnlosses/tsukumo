// 依頼に添えた画像の見せ方。送る前は入力欄の中の小さな札、送ったあとは依頼に付く控え。
//
// 札も控えも、押すと原寸を拡大して見られる。
// 押せる場所は絵（タッチ端末で虫眼鏡が見えていなくても、押せば同じに開く）で、札にはもう1つ `×`（外す）がある。
// 原寸の出どころは2つで、
//
// - 札: 送る前なので原寸はブラウザのメモリにある（サーバへは取りに行かない）
// - 控え: 記録に載っているのは控えと id だけなので、押したときに id でサーバの棚から取りに行く（`/prompt-image/<id>`。WebSocket のフレームには原寸を載せない）。
//   棚は直近の数枚しか持たないので、取れなかったら（404）控えを拡大の面に出し、原寸はもう手放したと1行添える（ブラウザは棚の中身を知らないので、取りに行ってから決める）。
//   続きから復元した依頼は控えを持たないので、棚の原寸から控えを作り直して描く
//
// 1枚も無いときは何も描かないので、常設の枠にならない。

import { clsx } from "clsx"
import { Search, X } from "lucide-react"
import { useState, type ReactElement } from "react"

import {
  type PromptImage,
  promptImagePath,
  type RecordedPromptImage,
} from "../../../../../../shared/session-driver/prompt-image.ts"
import { withOccurrenceKeys } from "../../../../../domain/occurrence-key.ts"
import { sessionTokenUrl } from "../../../../../domain/session-token-url.ts"
import { Button } from "../../../../ui/button/button.tsx"
import { ImageZoom, type ImageZoomFallback } from "../../../../ui/image-zoom/image-zoom.tsx"
import { useRemadeThumbnail } from "./hooks/use-remade-thumbnail.ts"
import styles from "./prompt-image.module.css"

/** 札にも控えにも同じ alt を付ける（中身は読めないので、そこに何があるかだけを伝える）。 */
const IMAGE_ALT = "添えた画像"

const ZOOM_LABEL = "この画像を拡大"
const REMOVE_LABEL = "この画像を外す"

/** 控えを押したが棚に原寸が残っていなかったときの1行（控えを代わりに出している理由）。 */
const RELEASED_NOTE = "原寸はもう手放したので、控えを拡大しています"

/**
 * 代わりを出さない。
 * 札の原寸はブラウザのメモリにあって読めないことが起きず、復元した控えには代わりに出せる控えが記録に無い。
 */
const NO_FALLBACK = { kind: "none" } as const satisfies ImageZoomFallback

type PromptImageChipsProps = {
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
        {withOccurrenceKeys(props.images, (image) => image.thumbnail).map(
          ({ key, item: image, index }) => (
            <li className={styles["prompt-image-chip"]} key={key}>
              {/* ボタンの中にボタンを入れないので、絵を押すボタンと外す `×` は兄弟にして、`×` を絵の右上に重ねる（CSS 側）。 */}
              <Button
                variant="ghost"
                size="label"
                pressed="none"
                disabled={false}
                ariaLabel={ZOOM_LABEL}
                disclosure={{ kind: "none" }}
                className={styles["prompt-image-zoom"]}
                onClick={() => setZoomedIndex(index)}
              >
                <img className={styles["prompt-image"]} src={image.thumbnail} alt={IMAGE_ALT} />
                <Search className={styles["prompt-image-zoom-icon"]} size={16} />
              </Button>
              <Button
                variant="outline-ground"
                size="secondary"
                pressed="none"
                disabled={false}
                ariaLabel={REMOVE_LABEL}
                disclosure={{ kind: "none" }}
                className={styles["prompt-image-remove"]}
                onClick={() => {
                  props.onRemove(index)
                }}
              >
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </Button>
            </li>
          ),
        )}
      </ul>
      {zoomedImage !== undefined && (
        <ImageZoom
          src={zoomedImage.full}
          alt={IMAGE_ALT}
          size="original"
          fallback={NO_FALLBACK}
          onClose={() => setZoomedIndex(undefined)}
        />
      )}
    </>
  )
}

type PromptImageThumbnailsProps = {
  /** 控えと、棚の原寸を指す id の組の並び（記録に残っているのはこれだけ）。 */
  readonly images: readonly RecordedPromptImage[]
  /**
   * 控えの大きさ。
   * compact は札と同じ高さで揃える（雑談の吹き出しの中）。
   * full は控えの元の大きさを上限に、比率のまま描く（メインビューの依頼の見出しの下）。
   */
  readonly size: "compact" | "full"
}

/**
 * 送ったあとの控え（依頼の見出しの下・雑談の吹き出しの中）。
 * 押すと棚の原寸を拡大の面で開き、棚に残っていなければ控えを代わりに出す。
 */
export function PromptImageThumbnails(props: PromptImageThumbnailsProps): ReactElement | null {
  // 開いている控えが何枚目か。id では持たない。
  // 「開いていない」の undefined が、形の崩れた記録の id（undefined）と一致して、閉じられない面が開くため。
  const [zoomedIndex, setZoomedIndex] = useState<number | undefined>(undefined)

  if (props.images.length === 0) {
    return null
  }

  const zoomedImage = zoomedIndex === undefined ? undefined : props.images[zoomedIndex]

  return (
    <>
      <ul className={styles["prompt-images"]}>
        {props.images.map((image, index) => {
          const onZoom = (): void => setZoomedIndex(index)
          return image.kind === "sent" ? (
            <ThumbnailItem key={image.id} src={image.thumbnail} size={props.size} onZoom={onZoom} />
          ) : (
            <RestoredThumbnailItem key={image.id} id={image.id} size={props.size} onZoom={onZoom} />
          )
        })}
      </ul>
      {zoomedImage !== undefined && (
        <ImageZoom
          key={zoomedImage.id}
          src={shelvedImageUrl(zoomedImage.id)}
          alt={IMAGE_ALT}
          size="original"
          fallback={
            zoomedImage.kind === "sent"
              ? { kind: "substitute", src: zoomedImage.thumbnail, note: RELEASED_NOTE }
              : NO_FALLBACK
          }
          onClose={() => setZoomedIndex(undefined)}
        />
      )}
    </>
  )
}

type ThumbnailItemProps = {
  readonly src: string
  readonly size: PromptImageThumbnailsProps["size"]
  readonly onZoom: () => void
}

function ThumbnailItem(props: ThumbnailItemProps): ReactElement {
  return (
    <li className={styles["prompt-image-thumbnail"]}>
      <Button
        variant="ghost"
        size="label"
        pressed="none"
        disabled={false}
        ariaLabel={ZOOM_LABEL}
        disclosure={{ kind: "none" }}
        className={styles["prompt-image-zoom"]}
        onClick={props.onZoom}
      >
        <img
          className={clsx(
            styles["prompt-image"],
            props.size === "full" && styles["prompt-image-full"],
          )}
          src={props.src}
          alt={IMAGE_ALT}
        />
        <Search className={styles["prompt-image-zoom-icon"]} size={16} />
      </Button>
    </li>
  )
}

/**
 * 続きから復元した依頼の控え1枚。棚の原寸からブラウザで作り直し、作れるまでと作れなかったときは何も描かない
 * （棚から原寸が消えていれば、見せられる絵がどこにも無い）。
 */
function RestoredThumbnailItem(
  props: Omit<ThumbnailItemProps, "src"> & { readonly id: string },
): ReactElement | null {
  const thumbnail = useRemadeThumbnail(shelvedImageUrl(props.id))
  if (thumbnail.kind !== "made") {
    return null
  }
  return <ThumbnailItem src={thumbnail.src} size={props.size} onZoom={props.onZoom} />
}

/** 棚の原寸を取りに行く URL。起動トークンはこのページの URL から引き継ぐ。 */
function shelvedImageUrl(id: string): string {
  return sessionTokenUrl(promptImagePath(id))
}
