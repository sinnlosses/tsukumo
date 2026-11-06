// 見比べの部品の画像を押して開く、大きく見る面。左右の2つ組・案内・×・図のキャプションを持ち、← → で左と右を入れかえる。
// 塊の外の画像の拡大は `ImageZoom` のまま。
// 面は `document.body` の直下へ描く。塊の中に置くと `.detail-block` 以下のレポート本文の規則（`p` の測り・図の画像の枠と角丸・側の箱の margin）が面の中身に当たる。

import { type KeyboardEvent, type ReactElement, useState } from "react"
import { createPortal } from "react-dom"

import type { ImageRegion } from "../../../../../../../shared/report/report-image.ts"
import { Button } from "../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../ui/dialog/dialog.tsx"
import styles from "./compare-zoom.module.css"
import { RegionFramed } from "./region-frame.tsx"

const HEADING = "前後の画像を大きく見る"
const PAIR_LABEL = "前後"
const CLOSE_LABEL = "閉じる"

export type CompareZoomSide = "before" | "after"

export type CompareZoomImage = {
  readonly side: CompareZoomSide
  readonly src: string
  readonly alt: string
  readonly region?: ImageRegion
}

type CompareZoomProps = {
  /** 読めた側の画像。2つ組はここにある側だけを出す。 */
  readonly images: readonly CompareZoomImage[]
  /** 最初に見せる側（押した画像の側）。 */
  readonly start: CompareZoomSide
  /** 2つ組の札（前後なら「前」「後」、対等な2つなら側の見出し）。 */
  readonly labels: Readonly<Record<CompareZoomSide, string>>
  /** 塊の題の行の「図 N」と題。題が空なら `text` は空。 */
  readonly caption: { readonly number: string; readonly text: string }
  /** `×`・背景のクリック・Esc のいずれでも呼ばれる。 */
  readonly onClose: () => void
}

const SIDES = ["before", "after"] as const satisfies readonly CompareZoomSide[]

const ARROW_SIDE = { ArrowLeft: "before", ArrowRight: "after" } as const satisfies Record<
  string,
  CompareZoomSide
>

/** 開いた状態で組み立てる面。閉じるときは呼び出し側がこの部品ごと外す。 */
export function CompareZoom(props: CompareZoomProps): ReactElement {
  const [side, setSide] = useState<CompareZoomSide>(props.start)
  const shown = props.images.find((image) => image.side === side) ?? props.images[0]

  function chooseByArrow(event: KeyboardEvent<HTMLDivElement>): void {
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowRight" ? ARROW_SIDE[event.key] : undefined
    if (next !== undefined && props.images.some((image) => image.side === next)) {
      event.preventDefault()
      setSide(next)
    }
  }

  return createPortal(
    <Dialog
      open={true}
      ariaLabel={HEADING}
      backdrop="deep"
      placement={{ kind: "auto" }}
      onClose={props.onClose}
      className={styles["compare-zoom"] ?? ""}
    >
      <div className={styles["compare-zoom-body"]} onKeyDown={chooseByArrow}>
        <div className={styles["compare-zoom-bar"]}>
          <div role="group" aria-label={PAIR_LABEL} className={styles["compare-zoom-pair"]}>
            {SIDES.map(
              (choice) =>
                props.images.some((image) => image.side === choice) && (
                  <Button
                    key={choice}
                    variant={shown?.side === choice ? "outline-accent-tinted" : "outline"}
                    size="action"
                    pressed={shown?.side === choice ? "on" : "off"}
                    disabled={false}
                    disclosure={{ kind: "none" }}
                    className={styles["compare-zoom-side"]}
                    onClick={() => setSide(choice)}
                  >
                    {props.labels[choice]}
                  </Button>
                ),
            )}
          </div>
          <span className={styles["compare-zoom-guide"]}>
            {`← → で${props.labels.before}と${props.labels.after} · Esc で閉じる`}
          </span>
          <Button
            variant="ghost"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={CLOSE_LABEL}
            disclosure={{ kind: "none" }}
            className={styles["compare-zoom-close"]}
            onClick={props.onClose}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        {shown !== undefined && <ShownImage image={shown} />}
        <p className={styles["compare-zoom-caption"]}>
          <span className={styles["compare-zoom-number"]}>{props.caption.number}</span>
          {props.caption.text !== "" && <span>{props.caption.text}</span>}
        </p>
      </div>
    </Dialog>,
    document.body,
  )
}

function ShownImage(props: { readonly image: CompareZoomImage }): ReactElement {
  const { image } = props
  const img = <img className={styles["compare-zoom-image"]} src={image.src} alt={image.alt} />
  return image.region === undefined ? (
    img
  ) : (
    <RegionFramed
      region={image.region}
      side={image.side}
      hostClassName={styles["compare-zoom-framed"]}
    >
      {img}
    </RegionFramed>
  )
}
