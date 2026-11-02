// レポートの ```mermaid フェンスの中身を図として描く。
// mermaid は tsukumo 自身のサーバから配り、図が現れたら手すきに `<script>` を読み込み、描くのはビューポートの少し手前に見えたときだけ。
//
// 1つのレポートに複数の図があっても、描くのは1つずつ（`drawing` の鎖）。
// 同じソースの図は描いた SVG を覚え、2回目以降は描かずに差し込む（失敗は覚えない）。
//
// 構文エラーのときはコードとエラー文を出す（mermaid のエラー図は出さない）。
// `initialize({ suppressErrorRendering: true })` を立てると、mermaid は失敗時に自分でエラーの絵を描くかわりに `render()` の Promise を reject する（mermaid 11.15.0 と 12.0.0 の `dist/mermaid.min.js` で確認済み）。
// `mermaid.parse()` による事前判定は使わない。読み込み自体の失敗（スクリプトが読めない）も含めて1つの catch で受け止められるため（読み込み失敗は `loadVendorScript` が `Error(src)` を投げるので、エラー文はその URL になる）。

import clsx from "clsx"
import { useRef, useState, type ReactElement } from "react"
import { isObjectType, sum } from "remeda"

import { vendorAssetPath } from "../../../../../../../shared/view-server/vendor-asset.ts"
import { useExternalSync } from "../../../../../../hooks/use-external-sync.ts"
import { useMountEffect } from "../../../../../../hooks/use-mount-effect.ts"
import { Text } from "../../../../../ui/text/text.tsx"
import { mergeRefs } from "../../../domain/merge-ref.ts"
import { useSeenOnce } from "../hooks/use-seen-once.ts"
import { figureZoomTriggerProps, SvgZoom } from "./figure-zoom.tsx"
import styles from "./mermaid-block.module.css"
import { isReadableTextPx, pickMeasure, topDownSource } from "./mermaid-figure-measure.ts"
import { mermaidFrameHeight } from "./mermaid-frame-height.ts"
import { resolveHex, resolveHexOver } from "./theme-color.ts"
import { loadVendorScript, preloadVendorScript } from "./vendor-script.ts"

const MERMAID_SRC = vendorAssetPath("mermaid.min.js")

/**
 * まだ描き終わっていない図の鎖。
 * `mermaid.run()` を同時に走らせると、一部の図が中身の無い SVG になる（11.15.0 で実測。1つのレポートに図を8つ置くと、毎回2〜3つが空で描かれ、落ちるものは実行のたびに変わった）。
 * mermaid はモジュール全体で1つの状態（`initialize` の設定と、描画中に使う一時の DOM）を持つので、ページ内の図は1つずつ順に描く。
 */
let drawing: Promise<unknown> = Promise.resolve()

/**
 * 描き終えた図。鍵は図のソース、値は SVG と、`render` に渡した id（SVG の中の id はすべてこれを頭に持つ）。
 * 色は mermaid が SVG に焼き込む。使う人が地や字の色を差し替えたら（`themeVariables` が変わったら）`syncTheme` が空にする。
 */
const drawn = new Map<string, DrawnDiagram>()

type DrawnDiagram = {
  readonly svg: string
  readonly id: string
}

let drawnTheme: string | undefined
let initializedTheme: string | undefined
let nextId = 0

type MermaidBlockProps = {
  readonly code: string
}

export function MermaidBlock(props: MermaidBlockProps): ReactElement {
  const nodeRef = useRef<HTMLPreElement>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [zoomed, setZoomed] = useState<SVGSVGElement | undefined>(undefined)
  const { ref: seenRef, seen } = useSeenOnce<HTMLPreElement>()

  const { code } = props

  useMountEffect(() => {
    preloadVendorScript(MERMAID_SRC)
  })

  useExternalSync(() => {
    let cancelled = false

    const themeNode = nodeRef.current
    if (!seen || themeNode === null) {
      return
    }
    const themeVariables = resolveThemeVariables(themeNode)
    syncTheme(themeVariables)
    const fit = (node: HTMLPreElement): Promise<void> =>
      fitTopDown({ node, code, themeNode, themeVariables, isCancelled: () => cancelled })
    const reportError = (reason: unknown): void => {
      if (!cancelled) {
        setError(mermaidErrorText(reason))
      }
    }
    const hit = drawn.get(code)
    if (hit === undefined) {
      drawInTurn(async () => {
        await loadVendorScript(MERMAID_SRC)
        if (cancelled) {
          return
        }
        const again = drawn.get(code)
        const node = nodeRef.current
        if (again !== undefined) {
          if (node !== null && !insertDiagram(node, again)) {
            await fit(node)
          }
          return
        }
        initializeFor(themeVariables, themeNode)
        const id = newDiagramId()
        const rendered = await mermaid.render(id, resolveTokens(code, themeNode))
        drawn.set(code, { svg: rendered.svg, id })
        if (cancelled || node === null) {
          return
        }
        if (!showRendered(node, rendered)) {
          await fit(node)
        }
      }).catch(reportError)
    } else {
      const node = nodeRef.current
      if (node !== null && !insertDiagram(node, hit)) {
        drawInTurn(() => fit(node)).catch(reportError)
      }
    }

    return () => {
      cancelled = true
    }
  }, [code, seen])

  if (error !== undefined) {
    return (
      <div className="mermaid-broken">
        <pre>
          <code>{props.code}</code>
        </pre>
        <Text
          element="p"
          size="secondary"
          tone="ink-quiet"
          weight="inherit"
          className={styles["mermaid-error"]}
        >
          {error}
        </Text>
      </div>
    )
  }

  return (
    <>
      <pre
        ref={mergeRefs(nodeRef, seenRef)}
        className={clsx("mermaid", styles["figure-frame"])}
        data-pending={seen ? undefined : "unseen"}
        style={{ [FRAME_HEIGHT_PROPERTY]: `${mermaidFrameHeight(props.code)}px` }}
        {...figureZoomTriggerProps(setZoomed)}
      />
      {zoomed !== undefined && <SvgZoom svg={zoomed} onClose={() => setZoomed(undefined)} />}
    </>
  )
}

const FRAME_HEIGHT_PROPERTY = "--frame-height"
const NATURAL_WIDTH_PROPERTY = "--natural-width"
const FIGURE_WIDTH_PROPERTY = "--figure-width"

/** mermaid の SVG の文字は、自然な大きさで 16px。 */
const SVG_TEXT_PX = 16

function newDiagramId(): string {
  return `mermaid-block-${nextId++}`
}

/**
 * mermaid の `themeVariables` をページの色のトークンから作る。`base` だけが差せて、値は hex しか受け取らない。
 */
function resolveThemeVariables(node: HTMLElement): Readonly<Record<string, string | boolean>> {
  const hex = (property: string): string => resolveHex(node, property)
  const hexOnSurface = (property: string): string => resolveHexOver(node, property, "--surface")
  return {
    darkMode: true,
    background: hex("--surface"),
    primaryColor: hexOnSurface("--surface-raised"),
    primaryTextColor: hex("--ink"),
    textColor: hex("--ink"),
    primaryBorderColor: hexOnSurface("--rule-soft"),
    lineColor: hexOnSurface("--ink-quiet"),
    arrowheadColor: hexOnSurface("--ink-quiet"),
    dropShadow: "none",
    useGradient: false,
    clusterBkg: hex("--surface"),
    clusterBorder: hexOnSurface("--rule-quiet"),
    noteBkgColor: hex("--surface-accent"),
    noteTextColor: hex("--ink"),
    fontFamily: getComputedStyle(node).fontFamily,
  }
}

/**
 * ソースの中の `var(--…)` を hex にする。mermaid の `classDef` / `linkStyle` は色の値を hex でしか受け取れない。
 */
function resolveTokens(code: string, node: HTMLElement): string {
  return code.replace(/var\((--[\w-]+)\)/g, (_, property: string) =>
    resolveHexOver(node, property, "--surface"),
  )
}

function syncTheme(themeVariables: Readonly<Record<string, string | boolean>>): void {
  const key = JSON.stringify(themeVariables)
  if (key !== drawnTheme) {
    drawn.clear()
    drawnTheme = key
  }
}

function initializeFor(
  themeVariables: Readonly<Record<string, string | boolean>>,
  themeNode: HTMLElement,
): void {
  const themeCSS = figureThemeCss(themeNode)
  const key = JSON.stringify([themeVariables, themeCSS])
  if (key === initializedTheme) {
    return
  }
  // 既定の配置は elk。dagre に固定する（測定は ADR 0034 の「結果」）
  mermaid.initialize({
    startOnLoad: false,
    layout: "dagre",
    theme: "base",
    themeVariables,
    themeCSS,
    securityLevel: "strict",
    suppressErrorRendering: true,
  })
  initializedTheme = key
}

/**
 * テーマ変数で決まらない箱とエッジラベルの見た目を決める `themeCSS`。
 * 拡大の面は図を画像にして開き、ページのカスタムプロパティを読めないので、色と角は値に解いて書く。
 * シーケンス図の参加者の箱は `filter` を属性で付けるので、`dropShadow` を外しても影が残る。
 * エッジラベルは地の矩形を持たず、字の縁取りで線と分ける（群の地の上でも矩形が浮かない）。
 * 字は 16px のまま（`figure-caption.md` の文字 12px の下限）。
 */
function figureThemeCss(node: HTMLElement): string {
  const radius = getComputedStyle(node).getPropertyValue("--radius-md").trim()
  const soft = resolveHexOver(node, "--ink-soft", "--surface")
  return [
    "rect, polygon, circle, ellipse, path { filter: none; }",
    `.node rect, .node .label-container, rect.actor { rx: ${radius}; ry: ${radius}; }`,
    ".edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg { background-color: transparent; }",
    // 状態遷移の span.edgeLabel は mermaid の `.label div .edgeLabel`（詳細度が上）が色を決めるので、同じ詳細度で後に並べる
    `.edgeLabel span, .label div .edgeLabel { color: ${soft}; -webkit-text-stroke: 5px ${resolveHex(node, "--surface")}; paint-order: stroke fill; }`,
    `.messageText { fill: ${soft}; }`,
  ].join("\n")
}

/**
 * 覚えた SVG を差し込む。同じ図が1画面に2つ並んでも、SVG の id と `<style>` の範囲が重ならないよう、id は毎回新しく付ける。
 */
function insertDiagram(node: HTMLPreElement, diagram: DrawnDiagram): boolean {
  node.innerHTML = diagram.svg.replaceAll(diagram.id, newDiagramId())
  node.dataset["processed"] = "true"
  return placeInMeasure(node)
}

/** 描いたばかりの SVG を差し、段に置けたかを返す。 */
function showRendered(
  node: HTMLPreElement,
  rendered: Awaited<ReturnType<typeof mermaid.render>>,
): boolean {
  node.innerHTML = rendered.svg
  node.dataset["processed"] = "true"
  rendered.bindFunctions?.(node)
  return placeInMeasure(node)
}

type TopDownFit = {
  readonly node: HTMLPreElement
  readonly code: string
  readonly themeNode: HTMLElement
  readonly themeVariables: Readonly<Record<string, string | boolean>>
  readonly isCancelled: () => boolean
}

/**
 * どの段でも下回った図を、TD に置き換えたソースで描き直して段に置く（TD の SVG は置き換えたソースを鍵に覚える）。
 * TD にできない図と、TD でも下回る図は、高さの上限を外して描く。
 * 初めて描くときも覚えた SVG を差すときも、同じソースと幅なら同じ形になる。
 */
async function fitTopDown(fit: TopDownFit): Promise<void> {
  const { node, code, themeNode, themeVariables, isCancelled } = fit
  const topDown = topDownSource(code)
  if (topDown !== undefined) {
    await loadVendorScript(MERMAID_SRC)
    const cached = drawn.get(topDown)
    if (cached === undefined) {
      initializeFor(themeVariables, themeNode)
      const id = newDiagramId()
      const rendered = await mermaid.render(id, resolveTokens(topDown, themeNode))
      drawn.set(topDown, { svg: rendered.svg, id })
      if (isCancelled() || showRendered(node, rendered)) {
        return
      }
    } else if (!isCancelled() && insertDiagram(node, cached)) {
      return
    }
  }
  if (!isCancelled()) {
    scrollAtNaturalWidth(node)
  }
}

/**
 * 差した SVG を、字が下限以上になる最も狭い幅の段に置く。どの段でも下回れば置かずに false を返す。
 * 段は `data-measure` に当てて、描画後の幅と `viewBox` の幅から縮尺を測る（高さの上限による縮みも含む）。
 * 寸法を持たない描画（まだ配置されていない・`viewBox` が無い）は測れないので、足りるものとして扱う。
 * 前後の部品の側の図は側の幅に収めるので、段を当てない。
 */
function placeInMeasure(node: HTMLPreElement): boolean {
  if (node.closest(".report-before-after-side") !== null) {
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

/**
 * 高さの上限を外して描く。自然幅が本文の列（body）の内幅に収まれば body の幅のまま自然幅で描く（natural）。
 * 超えれば読む面の幅にして（scroll）、自然幅が読む面の内幅を超えるとき、内幅まで縮めても字が下限以上なら内幅に縮め、下回るなら自然幅のまま `<pre>` の中で横に転がす。
 */
function scrollAtNaturalWidth(node: HTMLPreElement): void {
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

function innerWidthOf(node: HTMLPreElement): number {
  const style = getComputedStyle(node)
  const padding = sum(
    [style.paddingLeft, style.paddingRight].map((value) => Number.parseFloat(value) || 0),
  )
  return node.clientWidth - padding
}

/**
 * 図を1つ、前の図が描き終わってから描く。
 * 鎖は失敗で切らない（1つの図の構文エラーで、同じレポートの後続の図まで描かれなくなるのを避ける）。
 * 呼び出し側へは元の Promise を返すので、失敗したその図だけがエラー表示に切り替わる。
 */
function drawInTurn(draw: () => Promise<void>): Promise<unknown> {
  const turn = drawing.then(draw)
  drawing = turn.catch(() => undefined)
  return turn
}

/**
 * mermaid が投げる例外からエラー文を取り出す。
 * 構文エラーは `.str` に人が読める文面を持つが `Error` のインスタンスとは限らない（mermaid 自身の `handleError` も `"str" in error` で振り分けている）。
 * どちらでもなければ `Error#message` を使い、それも無ければ文字列化する。
 */
function mermaidErrorText(reason: unknown): string {
  if (isObjectType(reason) && "str" in reason) {
    const { str } = reason
    if (typeof str === "string") {
      return str
    }
  }
  return reason instanceof Error ? reason.message : String(reason)
}
