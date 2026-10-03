// レポートの ```mermaid フェンスの中身を図として描く。
// mermaid は tsukumo 自身のサーバから配り、その記法が実際に出てきたときだけ `<script>` で読み込む。
//
// 1つのレポートに複数の図があっても、描くのは1つずつ（`drawing` の鎖）。
// 同じソースの図は描いた SVG を覚え、2回目以降は描かずに差し込む（失敗は覚えない）。
//
// 構文エラーのときはコードとエラー文を出す（mermaid のエラー図は出さない）。
// `initialize({ suppressErrorRendering: true })` を立てると、mermaid は失敗時に自分でエラーの絵を描くかわりに `render()` の Promise を reject する（mermaid 11.15.0 と 12.0.0 の `dist/mermaid.min.js` で確認済み）。
// `mermaid.parse()` による事前判定は使わない。読み込み自体の失敗（スクリプトが読めない）も含めて1つの catch で受け止められるため（読み込み失敗は `loadVendorScript` が `Error(src)` を投げるので、エラー文はその URL になる）。

import { useEffect, useRef, useState, type ReactElement } from "react"
import { isObjectType } from "remeda"

import { vendorAssetPath } from "../../../../../../../shared/view-server/vendor-asset.ts"
import { Text } from "../../../../../ui/text/text.tsx"
import styles from "./mermaid-block.module.css"
import { resolveHex } from "./theme-color.ts"
import { loadVendorScript } from "./vendor-script.ts"

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

export type MermaidBlockProps = {
  readonly code: string
}

export function MermaidBlock(props: MermaidBlockProps): ReactElement {
  const nodeRef = useRef<HTMLPreElement>(null)
  const [error, setError] = useState<string | undefined>(undefined)

  const { code } = props

  useEffect(() => {
    let cancelled = false

    const themeNode = nodeRef.current
    if (themeNode === null) {
      return
    }
    const themeVariables = resolveThemeVariables(themeNode)
    syncTheme(themeVariables)
    const hit = drawn.get(code)
    if (hit === undefined) {
      drawInTurn(async () => {
        await loadVendorScript(MERMAID_SRC)
        if (cancelled) {
          return
        }
        const again = drawn.get(code)
        if (again !== undefined) {
          insertDiagram(nodeRef.current, again)
          return
        }
        initializeFor(themeVariables)
        const id = newDiagramId()
        const { svg, bindFunctions } = await mermaid.render(id, code)
        const diagram = { svg, id } satisfies DrawnDiagram
        drawn.set(code, diagram)
        const node = nodeRef.current
        if (cancelled || node === null) {
          return
        }
        node.innerHTML = svg
        node.dataset["processed"] = "true"
        bindFunctions?.(node)
      }).catch((reason: unknown) => {
        if (!cancelled) {
          setError(mermaidErrorText(reason))
        }
      })
    } else {
      insertDiagram(nodeRef.current, hit)
    }

    return () => {
      cancelled = true
    }
  }, [code])

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
    <pre ref={nodeRef} className="mermaid">
      {props.code}
    </pre>
  )
}

function newDiagramId(): string {
  return `mermaid-block-${nextId++}`
}

/**
 * mermaid の `themeVariables` をページの色のトークンから作る。`base` だけが差せて、値は hex しか受け取らない。
 */
function resolveThemeVariables(node: HTMLElement): Readonly<Record<string, string | boolean>> {
  const hex = (property: string, backdrop?: string): string => resolveHex(node, property, backdrop)
  return {
    darkMode: true,
    background: hex("--surface"),
    primaryColor: hex("--surface-raised", "--surface"),
    primaryTextColor: hex("--ink"),
    textColor: hex("--ink"),
    primaryBorderColor: hex("--rule"),
    lineColor: hex("--ink-soft", "--surface"),
    arrowheadColor: hex("--ink-soft", "--surface"),
    clusterBkg: hex("--ground"),
    edgeLabelBackground: hex("--surface"),
    noteBkgColor: hex("--surface-accent"),
    noteTextColor: hex("--ink"),
    fontFamily: getComputedStyle(node).fontFamily,
  }
}

function syncTheme(themeVariables: Readonly<Record<string, string | boolean>>): void {
  const key = JSON.stringify(themeVariables)
  if (key !== drawnTheme) {
    drawn.clear()
    drawnTheme = key
  }
}

function initializeFor(themeVariables: Readonly<Record<string, string | boolean>>): void {
  const key = JSON.stringify(themeVariables)
  if (key === initializedTheme) {
    return
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables,
    securityLevel: "strict",
    suppressErrorRendering: true,
  })
  initializedTheme = key
}

/**
 * 覚えた SVG を差し込む。同じ図が1画面に2つ並んでも、SVG の id と `<style>` の範囲が重ならないよう、id は毎回新しく付ける。
 */
function insertDiagram(node: HTMLPreElement | null, diagram: DrawnDiagram): void {
  if (node === null) {
    return
  }
  node.innerHTML = diagram.svg.replaceAll(diagram.id, newDiagramId())
  node.dataset["processed"] = "true"
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
