// `image` の塊の画像。サーバの棚（`/report-image/`）から起動トークンを付けて読み、読めなければ「出せない」の札に替える。
//
// 許可リストが `/report-image/` 以外の `src` を属性ごと落とすので、`src` が無い `img` も札にする（外部の URL を指していた画像など）。

import {
  createContext,
  type JSX,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  use,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"
import type { ExtraProps } from "react-markdown"

import {
  type ImageRegion,
  parseImageRegion,
  REPORT_IMAGE_PATH_PREFIX,
} from "../../../../../../../shared/report/report-image.ts"
import { sessionTokenUrl } from "../../../../../../domain/session-token-url.ts"
import { Button } from "../../../../../ui/button/button.tsx"
import { ImageZoom, type ImageZoomFallback } from "../../../../../ui/image-zoom/image-zoom.tsx"
import {
  type BeforeAfterView,
  loadBeforeAfterView,
  saveBeforeAfterView,
} from "./before-after-view.ts"
import { BeforeAfterZoom } from "./before-after-zoom.tsx"
import { RegionFramed } from "./region-frame.tsx"
import styles from "./report-notation.module.css"

const ZOOM_LABEL = "この画像を拡大"

const NO_FALLBACK = { kind: "none" } as const satisfies ImageZoomFallback

const MISSING_LABEL = "画像を出せない"
const MISSING_REASON = "読めなかったか、tsukumo を起こし直して手放した"
const MISSING_TEXT = `${MISSING_LABEL}（${MISSING_REASON}）`

type ReportImageProps = JSX.IntrinsicElements["img"] &
  ExtraProps & { "data-change-region"?: string }

type SwapSide = "before" | "after"

type SwapThumb = {
  readonly side: SwapSide
  readonly src: string
  readonly alt: string
  readonly region: ImageRegion | undefined
}

/**
 * 画像を押したときの拡大の先。`swap` は塊の前後の面（押した側と、戻すフォーカスの先を渡す）、`own` は画像ごとの拡大。
 */
type ImageZoomTarget =
  | { readonly kind: "own" }
  | {
      readonly kind: "swap"
      readonly open: (side: SwapSide, opener: HTMLElement | undefined) => void
    }

/**
 * 前後の画像の塊の中の画像が、札に替わったことと、読めた画像の `src`・`alt` を塊へ知らせる口と、押したときの拡大の先。
 * `alt` の先頭の字（前の画面・後の画面）が前か後かを言う。塊の外では何もせず、拡大は画像ごと。
 */
type BeforeAfterSwapContextValue = {
  readonly reportMissing: () => void
  readonly reportImage: (thumb: SwapThumb) => void
  readonly zoom: ImageZoomTarget
}

const BeforeAfterSwapContext = createContext<BeforeAfterSwapContextValue>({
  reportMissing: () => undefined,
  reportImage: () => undefined,
  zoom: { kind: "own" },
})

type SwapZoom = {
  readonly side: SwapSide
  readonly caption: { readonly number: string; readonly text: string }
}

const SWAP_SIDE_LABEL = { before: "前", after: "後" } as const satisfies Record<SwapSide, string>

const SWAP_SIDES = ["before", "after"] as const satisfies readonly SwapSide[]

const SWAP_VIEW_LABEL = { side: "並べる", switch: "切り替え" } as const satisfies Record<
  BeforeAfterView,
  string
>

const SWAP_VIEWS = ["side", "switch"] as const satisfies readonly BeforeAfterView[]

type BeforeAfterSwapProps = {
  readonly className: string | undefined
  readonly children: ReactNode
}

/**
 * 両側が画像の `beforeAfter` の包み。題の行の右の2つ組で「並べる」「切り替え」を選び、選び方を覚える。
 * 切り替えでは大きな1枚（前か後）と前・後の見本が並び、見本か、大きな1枚にフォーカスがあるときの Space で入れかわる。
 * 画像が一枚でも札になったら2つ組も見本も出さず、並べる形に落とす。
 */
export function BeforeAfterSwap(props: BeforeAfterSwapProps): ReactElement {
  const [view, setView] = useState<BeforeAfterView>(loadBeforeAfterView)
  const [shown, setShown] = useState<SwapSide>("before")
  const [missing, setMissing] = useState(false)
  const [thumbs, setThumbs] = useState<readonly SwapThumb[]>([])
  const [zoom, setZoom] = useState<SwapZoom | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | undefined>(undefined)
  const switches = view === "switch" && !missing

  function openZoom(side: SwapSide, opener: HTMLElement | undefined): void {
    openerRef.current = opener
    setZoom({ side, caption: readCaption(rootRef.current) })
  }

  function closeZoom(): void {
    flushSync(() => setZoom(undefined))
    openerRef.current?.focus()
  }

  function chooseView(next: BeforeAfterView): void {
    setView(next)
    saveBeforeAfterView(next)
  }

  function toggleShown(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      switches &&
      event.key === " " &&
      event.target instanceof Element &&
      event.target.closest(`.${styles["report-image-zoom"] ?? ""}`) !== null
    ) {
      event.preventDefault()
      setShown(shown === "before" ? "after" : "before")
    }
  }

  return (
    <BeforeAfterSwapContext
      value={{
        reportMissing: () => setMissing(true),
        reportImage: (thumb) => setThumbs((current) => withThumb(current, thumb)),
        zoom: missing ? { kind: "own" } : { kind: "swap", open: openZoom },
      }}
    >
      <div
        ref={rootRef}
        className={props.className}
        data-view={switches ? "switch" : "side"}
        data-shown={shown}
        onKeyDown={toggleShown}
      >
        {props.children}
        {!missing && (
          <div
            role="group"
            aria-label="見せ方"
            className={styles["report-before-after-swap-views"]}
          >
            {SWAP_VIEWS.map((choice) => (
              <Button
                key={choice}
                variant="ghost"
                size="label"
                pressed={view === choice ? "on" : "off"}
                disabled={false}
                ariaLabel={undefined}
                disclosure={{ kind: "none" }}
                ariaHasPopup={undefined}
                title={undefined}
                className={styles["report-before-after-swap-view"]}
                onClick={() => chooseView(choice)}
              >
                {SWAP_VIEW_LABEL[choice]}
              </Button>
            ))}
          </div>
        )}
        {switches && (
          <div className={styles["report-before-after-swap-thumbs"]}>
            {SWAP_SIDES.map((side) => {
              const thumb = thumbs.find((candidate) => candidate.side === side)
              return (
                thumb !== undefined && (
                  <Button
                    key={side}
                    variant={shown === side ? "outline-accent-tinted" : "outline"}
                    size="label"
                    pressed={shown === side ? "on" : "off"}
                    disabled={false}
                    ariaLabel={undefined}
                    disclosure={{ kind: "none" }}
                    ariaHasPopup={undefined}
                    title={undefined}
                    className={styles["report-before-after-swap-thumb"]}
                    onClick={() => setShown(side)}
                  >
                    <img src={thumb.src} alt="" />
                    <span>{SWAP_SIDE_LABEL[side]}</span>
                  </Button>
                )
              )
            })}
          </div>
        )}
        {zoom !== undefined && thumbs.length > 0 && (
          <BeforeAfterZoom
            images={thumbs}
            start={zoom.side}
            caption={zoom.caption}
            onClose={closeZoom}
          />
        )}
      </div>
    </BeforeAfterSwapContext>
  )
}

export function ReportImage(props: ReportImageProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const { reportMissing, reportImage, zoom } = use(BeforeAfterSwapContext)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const alt = props.alt ?? ""

  function openZoom(): void {
    if (zoom.kind === "swap") {
      zoom.open(sideOfAlt(alt), imageRef.current?.closest("button") ?? undefined)
    } else {
      setZoomed(true)
    }
  }

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
  const side = sideOfAlt(alt)
  const region = parseImageRegion(props["data-change-region"])
  const image = (
    <img
      src={src}
      alt={alt}
      width={props.width}
      height={props.height}
      loading="lazy"
      decoding="async"
      ref={(element) => {
        imageRef.current = element
        if (element !== null) {
          reportImage({ side, src, alt, region })
        }
      }}
      onError={() => setFailed(true)}
    />
  )
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
        onClick={openZoom}
      >
        {region === undefined ? (
          image
        ) : (
          <RegionFramed region={region} side={side} hostClassName={undefined}>
            {image}
          </RegionFramed>
        )}
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

function sideOfAlt(alt: string): SwapSide {
  return alt.startsWith(SWAP_SIDE_LABEL.after) ? "after" : "before"
}

function readCaption(root: HTMLElement | null): SwapZoom["caption"] {
  const read = (name: string | undefined): string =>
    name === undefined ? "" : (root?.querySelector(`.${name}`)?.textContent ?? "")
  return {
    number: read(styles["report-caption-number"]),
    text: read(styles["report-caption-text"]),
  }
}

function withThumb(thumbs: readonly SwapThumb[], next: SwapThumb): readonly SwapThumb[] {
  const current = thumbs.find((thumb) => thumb.side === next.side)
  if (
    current?.src === next.src &&
    current.alt === next.alt &&
    sameRegion(current.region, next.region)
  ) {
    return thumbs
  }
  return [...thumbs.filter((thumb) => thumb.side !== next.side), next]
}

function sameRegion(a: ImageRegion | undefined, b: ImageRegion | undefined): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.height === b.height)
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
