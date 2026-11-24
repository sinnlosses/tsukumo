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
import { isObjectType } from "remeda"

import { vendorAssetPath } from "../../../../shared/view-server/vendor-asset.ts"
import { Text } from "../../../components/ui/text/text.tsx"
import { useExternalSync } from "../../../hooks/use-external-sync.ts"
import { useMountEffect } from "../../../hooks/use-mount-effect.ts"
import { errorMessage } from "../../../utils/error-message.ts"
import { mergeRefs } from "../../../utils/merge-ref.ts"
import { useSeenOnce } from "../hooks/use-seen-once.ts"
import { figureZoomTriggerProps, SvgZoom } from "./figure-zoom.tsx"
import styles from "./mermaid-block.module.css"
import { topDownSource } from "./mermaid-figure-measure.ts"
import { placeInMeasure, scrollAtNaturalWidth } from "./mermaid-fit.ts"
import { mermaidFrameHeight } from "./mermaid-frame-height.ts"
import {
  figureThemeCss,
  forgetTokens,
  markThemed,
  resolveThemeVariables,
  resolveTokens,
} from "./mermaid-theme.ts"
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
    const themeVariables = resolveAndSyncTheme(themeNode)
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

function newDiagramId(): string {
  return `mermaid-block-${nextId++}`
}

/**
 * テーマ変数を解く。前と変わっていたら描いた図と対応表を空にし、解き直して対応表を作り直す
 * （空にしたあとに記録しないと、ノードの塗りなどのトークンが対応表から消える）。
 */
function resolveAndSyncTheme(node: HTMLElement): Readonly<Record<string, string | boolean>> {
  let themeVariables = resolveThemeVariables(node)
  const key = JSON.stringify(themeVariables)
  if (key !== drawnTheme) {
    drawn.clear()
    forgetTokens()
    drawnTheme = key
    themeVariables = resolveThemeVariables(node)
  }
  return themeVariables
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
 * 覚えた SVG を差し込む。同じ図が1画面に2つ並んでも、SVG の id と `<style>` の範囲が重ならないよう、id は毎回新しく付ける。
 */
function insertDiagram(node: HTMLPreElement, diagram: DrawnDiagram): boolean {
  node.innerHTML = diagram.svg.replaceAll(diagram.id, newDiagramId())
  node.dataset["processed"] = "true"
  markThemed(node)
  alignClusterLabelsStart(node)
  return placeInMeasure(node)
}

/** 群の題を群の枠の左上へ寄せる余白（px）。 */
const CLUSTER_LABEL_INSET = 8

/**
 * 群の題を、mermaid が置く上辺の中央から左端へ寄せる。
 * 中央のままだと、群の外から中央のノードへ入る矢印が題の字を貫く。
 * 題の位置が `translate(x, y)` 1つで、枠の矩形が `x` を持つ群だけを動かす（形の違う群は触らない）。
 */
function alignClusterLabelsStart(node: HTMLElement): void {
  for (const cluster of node.querySelectorAll("g.cluster")) {
    const frame = cluster.querySelector(":scope > rect")
    const label = cluster.querySelector(":scope > g.cluster-label")
    if (!(frame instanceof SVGRectElement) || !(label instanceof SVGGElement)) {
      continue
    }
    const placed = label.transform.baseVal.consolidate()
    if (placed === null) {
      continue
    }
    const top = placed.matrix.f
    placed.setTranslate(frame.x.baseVal.value + CLUSTER_LABEL_INSET, top)
  }
}

/** 描いたばかりの SVG を差し、段に置けたかを返す。 */
function showRendered(
  node: HTMLPreElement,
  rendered: Awaited<ReturnType<typeof mermaid.render>>,
): boolean {
  node.innerHTML = rendered.svg
  node.dataset["processed"] = "true"
  markThemed(node)
  alignClusterLabelsStart(node)
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
 * 図を1つ、前の図が描き終わってから描く。
 * 鎖は失敗で切らない（1つの図の構文エラーで、同じレポートの後続の図まで描かれなくなるのを避ける）。
 * 呼び出し側へは元の Promise を返すので、失敗したその図だけがエラー表示に切り替わる。
 */
function drawInTurn(draw: () => Promise<void>): Promise<unknown> {
  const turn = drawing.then(draw)
  // 失敗は呼び出し側へ返す `turn` が伝える。鎖は切らない
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
  return errorMessage(reason)
}
