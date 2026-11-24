import { reportExportMark } from "../report-export-copy.ts"
import { resolveHex, resolveHexOver } from "./theme-color.ts"

/**
 * mermaid の `themeVariables` をページの色のトークンから作る。`base` だけが差せて、値は hex しか受け取らない。
 */
export function resolveThemeVariables(
  node: HTMLElement,
): Readonly<Record<string, string | boolean>> {
  const hex = (property: string): string => recordToken(property, resolveHex(node, property))
  const hexOnSurface = (property: string): string => hexOverSurface(node, property)
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
export function resolveTokens(code: string, node: HTMLElement): string {
  return code.replace(/var\((--[\w-]+)\)/g, (_, property: string) => hexOverSurface(node, property))
}

/** テーマが変わったとき、解いた hex とトークンの対応を空にする。 */
export function forgetTokens(): void {
  tokenOfHex.clear()
}

export function markThemed(node: HTMLPreElement): void {
  const marks = reportExportMark.themedSvg(JSON.stringify(Object.fromEntries(tokenOfHex)))
  for (const [name, value] of Object.entries(marks)) {
    node.setAttribute(name, value)
  }
}

/**
 * テーマ変数で決まらない箱とエッジラベルの見た目を決める `themeCSS`。
 * 拡大の面は図を画像にして開き、ページのカスタムプロパティを読めないので、色と角は値に解いて書く。
 * シーケンス図の参加者の箱は `filter` を属性で付けるので、`dropShadow` を外しても影が残る。
 * エッジラベルは地の矩形を持たず、字の縁取りで線と分ける（群の地の上でも矩形が浮かない）。
 * 字は 16px のまま（`figure-caption.md` の文字 12px の下限）。
 */
export function figureThemeCss(node: HTMLElement): string {
  const radius = getComputedStyle(node).getPropertyValue("--radius-md").trim()
  const soft = hexOverSurface(node, "--ink-soft")
  return [
    "rect, polygon, circle, ellipse, path { filter: none; }",
    `.node rect, .node .label-container, rect.actor { rx: ${radius}; ry: ${radius}; }`,
    ".edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg { background-color: transparent; }",
    // 状態遷移の span.edgeLabel は mermaid の `.label div .edgeLabel`（詳細度が上）が色を決めるので、同じ詳細度で後に並べる
    `.edgeLabel span, .label div .edgeLabel { color: ${soft}; -webkit-text-stroke: 5px ${recordToken("--surface", resolveHex(node, "--surface"))}; paint-order: stroke fill; }`,
    `.messageText { fill: ${soft}; }`,
  ].join("\n")
}

/**
 * 解いた hex と元のトークンの対応。書き出しの写しが、SVG に焼いた色をトークンに戻すのに使う。
 * 同じ hex に複数のトークンが当たれば先に解いたほうを採る。
 */
const tokenOfHex = new Map<string, string>()

function recordToken(property: string, hex: string): string {
  const key = hex.toLowerCase()
  if (!tokenOfHex.has(key)) {
    tokenOfHex.set(key, property)
  }
  return hex
}

function hexOverSurface(node: HTMLElement, property: string): string {
  return recordToken(property, resolveHexOver(node, property, "--surface"))
}
