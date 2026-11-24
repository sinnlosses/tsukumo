import { sum } from "remeda"

import { isReadableTextPx, pickMeasure } from "./mermaid-figure-measure.ts"

const NATURAL_WIDTH_PROPERTY = "--natural-width"
const FIGURE_WIDTH_PROPERTY = "--figure-width"

/** mermaid の SVG の文字は、自然な大きさで 16px。 */
const SVG_TEXT_PX = 16

/**
 * 差した SVG を、字が下限以上になる最も狭い幅の段に置く。どの段でも下回れば置かずに false を返す。
 * 段は `data-measure` に当てて、描画後の幅と `viewBox` の幅から縮尺を測る（高さの上限による縮みも含む）。
 * 寸法を持たない描画（まだ配置されていない・`viewBox` が無い）は測れないので、足りるものとして扱う。
 * 前後の部品の側の図は側の幅に収めるので、段を当てない。
 */
export function placeInMeasure(node: HTMLPreElement): boolean {
  if (node.closest(".report-compare-figure-side") !== null) {
    return true
  }
  releaseFigureWidth(node)
  const measure = pickMeasure((candidate) => {
    node.dataset["measure"] = candidate
    return diagramTextPx(node)
  })
  if (measure === undefined) {
    return false
  }
  node.dataset["measure"] = measure
  node.style.removeProperty(NATURAL_WIDTH_PROPERTY)
  holdFigureWidth(node)
  return true
}

/**
 * 高さの上限を外して描く。自然幅が本文の列（body）の内幅に収まれば body の幅のまま自然幅で描く（natural）。
 * 超えれば読む面の幅にして（scroll）、自然幅が読む面の内幅を超えるとき、内幅まで縮めても字が下限以上なら内幅に縮め、下回るなら自然幅のまま `<pre>` の中で横に転がす。
 */
export function scrollAtNaturalWidth(node: HTMLPreElement): void {
  const [naturalWidth] = naturalSizeOf(node)
  node.dataset["measure"] = "body"
  if (naturalWidth <= innerWidthOf(node)) {
    node.dataset["measure"] = "natural"
    if (naturalWidth > 0) {
      node.style.setProperty(NATURAL_WIDTH_PROPERTY, `${naturalWidth}px`)
      setFigureWidth(node, naturalWidth)
    }
    return
  }
  node.dataset["measure"] = "scroll"
  const surfaceInnerWidth = innerWidthOf(node)
  const fitsSurface =
    surfaceInnerWidth < naturalWidth &&
    isReadableTextPx((SVG_TEXT_PX * surfaceInnerWidth) / naturalWidth)
  node.style.setProperty(
    NATURAL_WIDTH_PROPERTY,
    `${fitsSurface ? surfaceInnerWidth : naturalWidth}px`,
  )
}

/** 題と凡例が図の幅の中で中央に並ぶよう、`<pre>` を描いた図の幅に縮める（`svg` の幅は百分率で、包みが図の幅を知れない）。 */
function holdFigureWidth(node: HTMLPreElement): void {
  const width = node.querySelector("svg")?.getBoundingClientRect().width ?? 0
  if (width > 0) {
    setFigureWidth(node, width)
  }
}

function setFigureWidth(node: HTMLPreElement, width: number): void {
  node.style.setProperty(FIGURE_WIDTH_PROPERTY, `${width}px`)
  node.dataset["figureFit"] = ""
}

/** 段を測り直す間は、図の幅を持たせず段の幅に戻す。 */
function releaseFigureWidth(node: HTMLPreElement): void {
  node.style.removeProperty(FIGURE_WIDTH_PROPERTY)
  delete node.dataset["figureFit"]
}

/**
 * 箱の縦横比が `viewBox` と違うとき、絵は箱に収まる大きい側で縮む（高さの上限で幅が縦横比に従わないときがある）ので、縮尺は幅と高さの小さいほうで測る。
 */
function diagramTextPx(node: HTMLPreElement): number {
  const box = node.querySelector("svg")?.getBoundingClientRect()
  const [naturalWidth, naturalHeight] = naturalSizeOf(node)
  return box !== undefined && naturalWidth > 0 && box.width > 0 && box.height > 0
    ? SVG_TEXT_PX * Math.min(box.width / naturalWidth, box.height / naturalHeight)
    : Infinity
}

/** `viewBox="x y 幅 高さ"` の幅と高さ。読めなければ 0。 */
function naturalSizeOf(node: HTMLPreElement): readonly [number, number] {
  const [width, height] = (node.querySelector("svg")?.getAttribute("viewBox") ?? "")
    .split(/\s+/)
    .slice(2)
    .map(Number)
  return [
    width !== undefined && width > 0 ? width : 0,
    height !== undefined && height > 0 ? height : 0,
  ]
}

function innerWidthOf(node: HTMLPreElement): number {
  const style = getComputedStyle(node)
  const padding = sum(
    [style.paddingLeft, style.paddingRight].map((value) => Number.parseFloat(value) || 0),
  )
  return node.clientWidth - padding
}
