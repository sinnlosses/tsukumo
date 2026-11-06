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
import { type CompareView, loadCompareView, saveCompareView } from "./compare-view.ts"
import { CompareZoom } from "./compare-zoom.tsx"
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
  readonly region?: ImageRegion
}

type NaturalSize = { readonly width: number; readonly height: number }

const OVERLAY_RATIO_TOLERANCE = 0.01

const OVERLAY_START_POSITION = 50

/**
 * 画像を押したときの拡大の先。`swap` は塊の前後の面（押した側と、戻すフォーカスの先を渡す）、`own` は画像ごとの拡大。
 */
type ImageZoomTarget =
  | { readonly kind: "own" }
  | {
      readonly kind: "swap"
      readonly open: (side: SwapSide, opener?: HTMLElement) => void
    }

/**
 * 前後の画像の部品の中の画像が、札に替わったことと、読めた画像の `src`・`alt` を塊へ知らせる口と、押したときの拡大の先。
 * 画像がどちらの側かは {@link SwapSideContext} が言い、無ければ `alt` の先頭の字（前の画面・後の画面）で決める。塊の外では何もせず、拡大は画像ごと。
 */
type CompareSwapContextValue = {
  readonly reportMissing: () => void
  readonly reportImage: (thumb: SwapThumb) => void
  readonly reportSize: (side: SwapSide, size: NaturalSize) => void
  readonly zoom: ImageZoomTarget
}

const CompareSwapContext = createContext<CompareSwapContextValue>({
  reportMissing: () => undefined,
  reportImage: () => undefined,
  reportSize: () => undefined,
  zoom: { kind: "own" },
})

type SwapZoom = {
  readonly side: SwapSide
  readonly caption: { readonly number: string; readonly text: string }
}

/** 見比べの包みの中の画像がどちらの側か。`by-alt` は包みの側が言わない画像で、`alt` から決める。 */
export const SwapSideContext = createContext<SwapSide | "by-alt">("by-alt")

/** 両側が画像の見比べの包みの設定。`labels` は見本と拡大の面の札、`overlay` は「重ねる」を出すか。 */
export type SwapSettings = {
  readonly labels: Readonly<Record<SwapSide, string>>
  readonly overlay: boolean
}

const AFTER_ALT_PREFIX = "後"

const SWAP_SIDES = ["before", "after"] as const satisfies readonly SwapSide[]

const SWAP_VIEW_LABEL = {
  side: "並べる",
  switch: "切り替え",
  overlay: "重ねる",
} as const satisfies Record<CompareView, string>

const SWAP_VIEWS = ["side", "switch", "overlay"] as const satisfies readonly CompareView[]

type CompareSwapProps = {
  readonly className?: string
  readonly settings: SwapSettings
  readonly children: ReactNode
}

/**
 * 両側が画像の見比べの包み。題の行の右の組で「並べる」「切り替え」「重ねる」を選び、選び方を覚える。
 * 切り替えでは大きな1枚（左か右）と両側の見本が並び、見本か、大きな1枚にフォーカスがあるときの Space で入れかわる。
 * 重ねるでは左の上に右を重ね、つまみ（range）の位置から右だけ右の側を見せる。`overlay` が真で、両側の縦横比が揃う（差が 1% 以内）ときだけ選べる。
 * 画像が一枚でも札になったら押しボタンも見本も出さず、並べる形に落とす。
 */
export function CompareSwap(props: CompareSwapProps): ReactElement {
  const [chosen, setChosen] = useState<CompareView>(loadCompareView)
  const [shown, setShown] = useState<SwapSide>("before")
  const [missing, setMissing] = useState(false)
  const [thumbs, setThumbs] = useState<readonly SwapThumb[]>([])
  const [sizes, setSizes] = useState<Partial<Record<SwapSide, NaturalSize>>>({})
  const [position, setPosition] = useState(OVERLAY_START_POSITION)
  const [zoom, setZoom] = useState<SwapZoom | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | undefined>(undefined)
  const overlayable = props.settings.overlay && !missing && sameRatio(sizes.before, sizes.after)
  const view = chosen === "overlay" && !overlayable ? "side" : chosen
  const switches = view === "switch" && !missing

  function openZoom(side: SwapSide, opener?: HTMLElement): void {
    openerRef.current = opener
    setZoom({ side, caption: readCaption(rootRef.current) })
  }

  function closeZoom(): void {
    flushSync(() => setZoom(undefined))
    openerRef.current?.focus()
  }

  function chooseView(next: CompareView): void {
    setChosen(next)
    saveCompareView(next)
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
    <CompareSwapContext
      value={{
        reportMissing: () => setMissing(true),
        reportImage: (thumb) => setThumbs((current) => withThumb(current, thumb)),
        reportSize: (side, size) => setSizes((current) => ({ ...current, [side]: size })),
        zoom: missing ? { kind: "own" } : { kind: "swap", open: openZoom },
      }}
    >
      <div
        ref={rootRef}
        className={props.className}
        data-view={missing ? "side" : view}
        data-shown={shown}
        style={{ "--overlay-position": `${String(position)}%` }}
        onKeyDown={toggleShown}
      >
        {props.children}
        {!missing && (
          <div role="group" aria-label="見せ方" className={styles["report-compare-swap-views"]}>
            {SWAP_VIEWS.filter((choice) => choice !== "overlay" || overlayable).map((choice) => (
              <Button
                key={choice}
                variant="ghost"
                size="label"
                pressed={view === choice ? "on" : "off"}
                disabled={false}
                disclosure={{ kind: "none" }}
                className={styles["report-compare-swap-view"]}
                onClick={() => chooseView(choice)}
              >
                {SWAP_VIEW_LABEL[choice]}
              </Button>
            ))}
          </div>
        )}
        {view === "overlay" && (
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            aria-label="前後の境"
            className={styles["report-compare-swap-slider"]}
            onChange={(event) => setPosition(event.currentTarget.valueAsNumber)}
          />
        )}
        {switches && (
          <div className={styles["report-compare-swap-thumbs"]}>
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
                    disclosure={{ kind: "none" }}
                    className={styles["report-compare-swap-thumb"]}
                    onClick={() => setShown(side)}
                  >
                    <img src={thumb.src} alt="" />
                    <span>{props.settings.labels[side]}</span>
                  </Button>
                )
              )
            })}
          </div>
        )}
        {zoom !== undefined && thumbs.length > 0 && (
          <CompareZoom
            images={thumbs}
            start={zoom.side}
            labels={props.settings.labels}
            caption={zoom.caption}
            onClose={closeZoom}
          />
        )}
      </div>
    </CompareSwapContext>
  )
}

export function ReportImage(props: ReportImageProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const { reportMissing, reportImage, reportSize, zoom } = use(CompareSwapContext)
  const sideScope = use(SwapSideContext)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const alt = props.alt ?? ""
  const side = sideScope === "by-alt" ? sideOfAlt(alt) : sideScope

  function openZoom(): void {
    if (zoom.kind === "swap") {
      zoom.open(side, imageRef.current?.closest("button") ?? undefined)
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
  const src = sessionTokenUrl(props.src, window.location.href)
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
      onLoad={(event) =>
        reportSize(side, {
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
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
  return alt.startsWith(AFTER_ALT_PREFIX) ? "after" : "before"
}

function readCaption(root: HTMLElement | null): SwapZoom["caption"] {
  const read = (name: string): string => root?.querySelector(`.${name}`)?.textContent ?? ""
  const numberClass = styles["report-caption-number"]
  const textClass = styles["report-caption-text"]
  return {
    number: numberClass === undefined ? "" : read(numberClass),
    text: textClass === undefined ? "" : read(textClass),
  }
}

function sameRatio(a?: NaturalSize, b?: NaturalSize): boolean {
  if (a === undefined || b === undefined || a.height === 0 || b.height === 0) {
    return false
  }
  const ratioA = a.width / a.height
  const ratioB = b.width / b.height
  return Math.abs(ratioA - ratioB) / ratioB <= OVERLAY_RATIO_TOLERANCE
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

function sameRegion(a?: ImageRegion, b?: ImageRegion): boolean {
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
