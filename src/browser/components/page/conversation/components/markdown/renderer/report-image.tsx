// `image` の塊の画像。サーバの棚（`/report-image/`）から起動トークンを付けて読み、読めなければ「出せない」の札に替える。
//
// 許可リストが `/report-image/` 以外の `src` を属性ごと落とすので、`src` が無い `img` も札にする（外部の URL を指していた画像など）。

import { createContext, type JSX, type ReactElement, type ReactNode, use, useState } from "react"
import type { ExtraProps } from "react-markdown"

import { REPORT_IMAGE_PATH_PREFIX } from "../../../../../../../shared/report/report-image.ts"
import { sessionTokenUrl } from "../../../../../../domain/session-token-url.ts"
import { Button } from "../../../../../ui/button/button.tsx"
import { ImageZoom, type ImageZoomFallback } from "../../../../../ui/image-zoom/image-zoom.tsx"
import styles from "./report-notation.module.css"

const ZOOM_LABEL = "この画像を拡大"

const NO_FALLBACK = { kind: "none" } as const satisfies ImageZoomFallback

const MISSING_LABEL = "画像を出せない"
const MISSING_REASON = "読めなかったか、tsukumo を起こし直して手放した"
const MISSING_TEXT = `${MISSING_LABEL}（${MISSING_REASON}）`

type ReportImageProps = JSX.IntrinsicElements["img"] & ExtraProps

/** 前後の画像の塊の中の画像が、札に替わったことを塊へ知らせる口。塊の外では何もしない。 */
const MissingImageContext = createContext<() => void>(() => undefined)

const SWAP_SIDE_LABEL = { before: "前", after: "後" } as const

type BeforeAfterSwapProps = {
  readonly className: string | undefined
  readonly children: ReactNode
}

/**
 * 両側が画像の `beforeAfter` の包み。既定は並べる形で、題の行の右の口で同じ位置に重ねる形へ替える。
 * 重ねる形では前か後の一方だけが見え、入れ替える口を押すたび即時に替わる。画像が一枚でも札になったら口を出さない。
 */
export function BeforeAfterSwap(props: BeforeAfterSwapProps): ReactElement {
  const [stacked, setStacked] = useState(false)
  const [shown, setShown] = useState<keyof typeof SWAP_SIDE_LABEL>("before")
  const [missing, setMissing] = useState(false)
  const other = shown === "before" ? "after" : "before"
  const showsStack = stacked && !missing

  return (
    <MissingImageContext value={() => setMissing(true)}>
      <div
        className={props.className}
        data-view={showsStack ? "stacked" : "side"}
        data-shown={shown}
      >
        {props.children}
        {!missing && (
          <div className={styles["report-before-after-swap-controls"]}>
            {showsStack && (
              <Button
                variant="outline"
                size="label"
                pressed="none"
                disabled={false}
                ariaLabel={`${SWAP_SIDE_LABEL[other]}に入れ替える（いまは${SWAP_SIDE_LABEL[shown]}）`}
                disclosure={{ kind: "none" }}
                ariaHasPopup={undefined}
                title={undefined}
                className={styles["report-before-after-swap-button"]}
                onClick={() => setShown(other)}
              >
                {SWAP_SIDE_LABEL[other]}に入れ替える
              </Button>
            )}
            <Button
              variant="outline"
              size="label"
              pressed="none"
              disabled={false}
              ariaLabel={undefined}
              disclosure={{ kind: "none" }}
              ariaHasPopup={undefined}
              title={undefined}
              className={styles["report-before-after-swap-button"]}
              onClick={() => setStacked(!stacked)}
            >
              {showsStack ? "並べて見る" : "重ねて見る"}
            </Button>
          </div>
        )}
      </div>
    </MissingImageContext>
  )
}

export function ReportImage(props: ReportImageProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const reportMissing = use(MissingImageContext)
  const alt = props.alt ?? ""

  if (failed || typeof props.src !== "string" || !props.src.startsWith(REPORT_IMAGE_PATH_PREFIX)) {
    return (
      <span
        role="img"
        aria-label={alt || MISSING_TEXT}
        className={styles["report-image-missing"]}
        ref={(element) => {
          if (element !== null) {
            reportMissing()
          }
        }}
      >
        <span className={styles["report-image-missing-body"]} aria-hidden="true">
          <MissingImageIcon />
          <span className={styles["report-image-missing-label"]}>{MISSING_LABEL}</span>
          <span className={styles["report-image-missing-reason"]}>{MISSING_REASON}</span>
        </span>
      </span>
    )
  }
  const src = sessionTokenUrl(props.src)
  return (
    <>
      <Button
        variant="ghost"
        size="label"
        pressed="none"
        disabled={false}
        ariaLabel={ZOOM_LABEL}
        disclosure={{ kind: "none" }}
        ariaHasPopup={undefined}
        title={undefined}
        className={styles["report-image-zoom"]}
        onClick={() => setZoomed(true)}
      >
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      </Button>
      {zoomed && (
        <ImageZoom
          src={src}
          alt={alt}
          size="width"
          fallback={NO_FALLBACK}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  )
}

function MissingImageIcon(): ReactElement {
  return (
    <span className={styles["report-image-missing-icon"]}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-6 6M3 3l18 18" />
      </svg>
    </span>
  )
}
