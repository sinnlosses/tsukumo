// レポートの図（mermaid・graph・svg の塊）を拡大して見る口。
// 描いた svg を `<img>` の data URL にして、画像の拡大と同じ `ImageZoom`（`size="width"`）に渡す。
//
// svg の中の色や字の大きさはページの CSS が当てているので、`<img>` の中では効かない。
// 複製の側へ計算済みの値を書き写してから文字にする。

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react"

import { ImageZoom, type ImageZoomFallback } from "../../../../../ui/image-zoom/image-zoom.tsx"

const ZOOM_LABEL = "この図を拡大"

const NO_FALLBACK = { kind: "none" } as const satisfies ImageZoomFallback

const COPIED_PROPERTIES = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "font-family",
  "font-size",
  "font-weight",
] as const

type FigureZoomTriggerProps = {
  readonly role: "button"
  readonly tabIndex: 0
  readonly "aria-label": string
  readonly onClick: (event: MouseEvent<HTMLElement>) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * 図を押せる・キーで開ける要素にする属性。
 * 押された要素の中の svg（描き終える前は無い）を `onOpen` へ渡す。
 */
export function figureZoomTriggerProps(
  onOpen: (svg: SVGSVGElement) => void,
): FigureZoomTriggerProps {
  const open = (figure: HTMLElement): void => {
    const svg = figure.querySelector("svg")
    if (svg !== null) {
      onOpen(svg)
    }
  }
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": ZOOM_LABEL,
    onClick: (event) => open(event.currentTarget),
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) {
        return
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        open(event.currentTarget)
      }
    },
  }
}

/** svg を、実寸（`viewBox` の幅と高さ）を持つ `<img>` 用の data URL にする。 */
export function svgDataUrl(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true)
  if (!(copy instanceof Element)) {
    return ""
  }
  const size = naturalSize(svg)
  copy.setAttribute("width", String(size.width))
  copy.setAttribute("height", String(size.height))
  copy.removeAttribute("style")
  copyComputedStyle(svg, copy)
  const text = new XMLSerializer().serializeToString(copy)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
}

type SvgZoomProps = {
  readonly svg: SVGSVGElement
  readonly onClose: () => void
}

/** 開いた状態で組み立てる拡大の面。 */
export function SvgZoom(props: SvgZoomProps): ReactElement {
  return (
    <ImageZoom
      src={svgDataUrl(props.svg)}
      alt="図"
      size="width"
      fallback={NO_FALLBACK}
      onClose={props.onClose}
    />
  )
}

type ZoomableSvgFigureProps = {
  readonly className: string | undefined
  readonly children: ReactNode
}

/** `svg` の塊の包み。押すと中の svg を拡大する。 */
export function ZoomableSvgFigure(props: ZoomableSvgFigureProps): ReactElement {
  const [zoomed, setZoomed] = useState<SVGSVGElement | undefined>(undefined)

  return (
    <>
      <div className={props.className} {...figureZoomTriggerProps(setZoomed)}>
        {props.children}
      </div>
      {zoomed !== undefined && <SvgZoom svg={zoomed} onClose={() => setZoomed(undefined)} />}
    </>
  )
}

function naturalSize(svg: SVGSVGElement): { readonly width: number; readonly height: number } {
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number)
  const [, , width, height] = box
  if (box.length === 4 && width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { width, height }
  }
  const rect = svg.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

/** 同じ形の2つの木を並べて歩き、`foreignObject` の中（HTML）を除く svg の要素へ計算済みの値を書く。 */
function copyComputedStyle(source: Element, target: Element): void {
  if (source.namespaceURI === "http://www.w3.org/2000/svg") {
    const computed = getComputedStyle(source)
    const declarations = COPIED_PROPERTIES.map(
      (property) => [property, computed.getPropertyValue(property)] as const,
    )
      .filter(([, value]) => value !== "")
      .map(([property, value]) => `${property}:${value}`)
    target.setAttribute(
      "style",
      [target.getAttribute("style") ?? "", ...declarations].filter((part) => part !== "").join(";"),
    )
  }
  if (source.localName === "foreignObject") {
    return
  }
  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  sourceChildren.forEach((child, index) => {
    const twin = targetChildren[index]
    if (twin !== undefined) {
      copyComputedStyle(child, twin)
    }
  })
}
