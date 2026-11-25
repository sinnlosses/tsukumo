// 絵を拡大して見るダイアログ。中身は Astryx の `Lightbox` で、呼び出し側が開いている状態を持ち、開いている間だけこの部品を描く。
//
// 絵が読めなかったときに何を出すかは呼び出し側が渡す（`ImageZoomFallback`）。
// `Lightbox` は `<img>` の `error` を渡さないので、開くときに別の `Image` で読めるかを確かめる。
// この部品は代わりの絵と1行を出し分けるだけで、なぜ読めないかは知らない。

// `Lightbox` の拡大は画面に収めた大きさが下限なので、それより小さく見せる分はこの部品が持つ。
// 拡大していない間の ctrl 付きのホイール（トラックパッドのピンチ）を `Lightbox` より先に受け、
// 収めた大きさに対する割合を変える。割合が 1 に戻ってからは `Lightbox` の拡大に渡す。

import { Lightbox } from "@astryxdesign/core/Lightbox"
import { type ReactElement, useState } from "react"

import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import styles from "./image-zoom.module.css"

const HEADING = "画像の拡大"

/** 収めた大きさに対する割合の下限。 */
const MIN_FIT = 0.3

// ホイールの量 1 あたりの変化。トラックパッドのピンチ 1 回（量の合計がおよそ 100）で半分ほどになる。
const FIT_SENSITIVITY = 0.007

/**
 * 絵が読めなかったときに代わりに出すもの。
 *
 * - `none`: 代わりは無い（読めないことが起きない。原寸がブラウザのメモリにある札など）
 * - `substitute`: 代わりの絵（`src`）と、なぜ代わりなのかを伝える1行（`note`）
 */
export type ImageZoomFallback =
  | { readonly kind: "none" }
  | { readonly kind: "substitute"; readonly src: string; readonly note: string }

type ImageZoomProps = {
  /** 拡大して見せる原寸（data URL か、原寸を配る経路の URL）。 */
  readonly src: string
  readonly alt: string
  /** 呼ぶ側の意図（原寸・控えめ・幅に合わせる）。大きさは `Lightbox` の拡大に任せ、見た目には使わない。 */
  readonly size: "original" | "modest" | "width"
  /** `src` が読めなかったときに代わりに出すもの。 */
  readonly fallback: ImageZoomFallback
  /** `×`・背景のクリック・Esc のいずれでも呼ばれる（開いているかどうかは呼び出し側が持つ）。 */
  readonly onClose: () => void
}

/** 開いた状態で組み立てられる部品。閉じるときは呼び出し側がこの部品ごと外す。 */
export function ImageZoom(props: ImageZoomProps): ReactElement {
  // 読めなかったか。開くたびに組み立て直す部品なので、閉じて開き直せばまた原寸を取りに行く。
  const [failed, setFailed] = useState(false)
  const substitute = failed && props.fallback.kind === "substitute" ? props.fallback : undefined
  const hasSubstitute = props.fallback.kind === "substitute"

  useExternalSync(() => {
    if (!hasSubstitute) {
      return
    }
    const probe = new Image()
    probe.addEventListener("error", () => setFailed(true))
    probe.src = props.src
  }, [hasSubstitute, props.src])

  const [dialog, setDialog] = useState<HTMLDialogElement>()
  // 収めた大きさに対する割合。開くたびに組み立て直すので、開き直せば 1 に戻る。
  const [fit, setFit] = useState(1)

  useExternalSync(() => {
    if (dialog === undefined) {
      return
    }
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || isLightboxZoomed(dialog)) {
        return
      }
      const shrinking = event.deltaY > 0
      if (!shrinking && fit >= 1) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setFit(nextFit(fit, event.deltaY))
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "0") {
        setFit(1)
      }
    }
    // 写真の箱の wheel より先に受けるため、dialog の capture で張る。
    dialog.addEventListener("wheel", onWheel, { capture: true, passive: false })
    dialog.addEventListener("keydown", onKeyDown)
    return () => {
      dialog.removeEventListener("wheel", onWheel, { capture: true })
      dialog.removeEventListener("keydown", onKeyDown)
    }
  }, [dialog, fit])

  return (
    <Lightbox
      ref={(element) => setDialog(element ?? undefined)}
      className={styles["image-zoom"]}
      style={{ "--image-zoom-fit": String(fit) }}
      isOpen={true}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          props.onClose()
        }
      }}
      media={{
        src: substitute?.src ?? props.src,
        alt: props.alt,
        caption: substitute?.note,
      }}
      hasZoom={true}
      aria-label={HEADING}
    />
  )
}

function nextFit(fit: number, deltaY: number): number {
  return Math.min(1, Math.max(MIN_FIT, fit * Math.exp(-deltaY * FIT_SENSITIVITY)))
}

// `Lightbox` は拡大している間、写真の箱に aria-pressed="true" を立てる。
function isLightboxZoomed(dialog: HTMLDialogElement): boolean {
  return dialog.querySelector('[data-lightbox-page-media][aria-pressed="true"]') !== null
}
