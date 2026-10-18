// 前後の塊の画像を押して開く、大きく見る面。前／後の2つ組・案内・×・図のキャプションを持ち、← → で前と後を入れかえる。
// 塊の外の画像の拡大は `ImageZoom` のまま。
// 面は `document.body` の直下へ描く。塊の中に置くと `.detail-block` 以下のレポート本文の規則（`p` の測り・図の画像の枠と角丸・側の箱の margin）が面の中身に当たる。

import { type KeyboardEvent, type ReactElement, useState } from "react"
import { createPortal } from "react-dom"

import type { ImageRegion } from "../../../../../../../shared/report/report-image.ts"
import { Button } from "../../../../../ui/button/button.tsx"
import { Dialog } from "../../../../../ui/dialog/dialog.tsx"
import styles from "./before-after-zoom.module.css"
import { RegionFramed } from "./region-frame.tsx"

const HEADING = "前後の画像を大きく見る"
const PAIR_LABEL = "前後"
const CLOSE_LABEL = "閉じる"
const KEY_GUIDE = "← → で前と後 · Esc で閉じる"

export type BeforeAfterZoomSide = "before" | "after"

export type BeforeAfterZoomImage = {
  readonly side: BeforeAfterZoomSide
  readonly src: string
  readonly alt: string
  readonly region: ImageRegion | undefined
}

type BeforeAfterZoomProps = {
  /** 読めた側の画像。2つ組はここにある側だけを出す。 */
  readonly images: readonly BeforeAfterZoomImage[]
  /** 最初に見せる側（押した画像の側）。 */
  readonly start: BeforeAfterZoomSide
  /** 塊の題の行の「図 N」と題。題が空なら `text` は空。 */
  readonly caption: { readonly number: string; readonly text: string }
  /** `×`・背景のクリック・Esc のいずれでも呼ばれる。 */
  readonly onClose: () => void
}

const SIDE_LABEL = { before: "前", after: "後" } as const satisfies Record<
  BeforeAfterZoomSide,
  string
>

const SIDES = ["before", "after"] as const satisfies readonly BeforeAfterZoomSide[]

const ARROW_SIDE = { ArrowLeft: "before", ArrowRight: "after" } as const satisfies Record<
  string,
  BeforeAfterZoomSide
>

/** 開いた状態で組み立てる面。閉じるときは呼び出し側がこの部品ごと外す。 */
export function BeforeAfterZoom(props: BeforeAfterZoomProps): ReactElement {
  const [side, setSide] = useState<BeforeAfterZoomSide>(props.start)
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
      className={styles["before-after-zoom"] ?? ""}
    >
      <div className={styles["before-after-zoom-body"]} onKeyDown={chooseByArrow}>
        <div className={styles["before-after-zoom-bar"]}>
          <div role="group" aria-label={PAIR_LABEL} className={styles["before-after-zoom-pair"]}>
            {SIDES.map(
              (choice) =>
                props.images.some((image) => image.side === choice) && (
                  <Button
                    key={choice}
                    variant={shown?.side === choice ? "outline-accent-tinted" : "outline"}
                    size="action"
                    pressed={shown?.side === choice ? "on" : "off"}
                    disabled={false}
                    ariaLabel={undefined}
                    disclosure={{ kind: "none" }}
                    ariaHasPopup={undefined}
                    title={undefined}
                    className={styles["before-after-zoom-side"]}
                    onClick={() => setSide(choice)}
                  >
                    {SIDE_LABEL[choice]}
                  </Button>
                ),
            )}
          </div>
          <span className={styles["before-after-zoom-guide"]}>{KEY_GUIDE}</span>
          <Button
            variant="ghost"
            size="action"
            pressed="none"
            disabled={false}
            ariaLabel={CLOSE_LABEL}
            disclosure={{ kind: "none" }}
            ariaHasPopup={undefined}
            title={undefined}
            className={styles["before-after-zoom-close"]}
            onClick={props.onClose}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        {shown !== undefined && <ShownImage image={shown} />}
        <p className={styles["before-after-zoom-caption"]}>
          <span className={styles["before-after-zoom-number"]}>{props.caption.number}</span>
          {props.caption.text !== "" && <span>{props.caption.text}</span>}
        </p>
      </div>
    </Dialog>,
    document.body,
  )
}

function ShownImage(props: { readonly image: BeforeAfterZoomImage }): ReactElement {
  const { image } = props
  const img = <img className={styles["before-after-zoom-image"]} src={image.src} alt={image.alt} />
  return image.region === undefined ? (
    img
  ) : (
    <RegionFramed
      region={image.region}
      side={image.side}
      hostClassName={styles["before-after-zoom-framed"]}
    >
      {img}
    </RegionFramed>
  )
}
