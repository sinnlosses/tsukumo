// 絵を拡大して見るダイアログ。中身は Astryx の `Lightbox` で、呼び出し側が開いている状態を持ち、開いている間だけこの部品を描く。
//
// 絵が読めなかったときに何を出すかは呼び出し側が渡す（`ImageZoomFallback`）。
// `Lightbox` は `<img>` の `error` を渡さないので、開くときに別の `Image` で読めるかを確かめる。
// この部品は代わりの絵と1行を出し分けるだけで、なぜ読めないかは知らない。

import { Lightbox } from "@astryxdesign/core/Lightbox"
import { type ReactElement, useState } from "react"

import { useExternalSync } from "../../../hooks/use-external-sync.ts"

const HEADING = "画像の拡大"

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

  return (
    <Lightbox
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
