// 押せるパスの下（下が足りなければ上）に浮かせる、指した行の前後の抜き書き。
// 照らし合わせ用で、押せる要素を持たない。窓の座標で置くので `document.body` に出す。

import clsx from "clsx"
import type { ReactElement } from "react"
import { createPortal } from "react-dom"

import type { LineRange } from "../../domain/pointed-line-range.ts"
import type { PeekAnchor, ShownFileExcerpt } from "../../hooks/use-file-excerpt-peek.ts"
import styles from "./file-excerpt-peek.module.css"

/** 押せるパスと浮きのあき（px）。 */
const GAP_PX = 6
/** 窓の端から空ける幅（px）。 */
const WINDOW_MARGIN_PX = 8

type FileExcerptPeekProps = {
  /** 押せるパスの `aria-describedby` が指す id。 */
  readonly id: string
  readonly path: string
  readonly pointed: LineRange
  readonly excerpt: ShownFileExcerpt
  readonly anchor: PeekAnchor
}

export function FileExcerptPeek(props: FileExcerptPeekProps): ReactElement {
  const { pointed, excerpt } = props
  return createPortal(
    <div
      id={props.id}
      role="tooltip"
      className={styles["file-excerpt-peek"]}
      ref={(node) => {
        placeNearAnchor(node, props.anchor)
      }}
    >
      <div className={styles["peek-head"]}>
        {props.path} · {headRangeOf(excerpt, pointed)}
      </div>
      {excerpt.kind === "lines" && (
        <pre className={styles["peek-code"]}>
          {excerpt.lines.map((line) => {
            const isPointed = line.number >= pointed.startLine && line.number <= pointed.endLine
            return (
              <span
                key={line.number}
                className={clsx(styles["peek-line"], isPointed && styles["peek-line-pointed"])}
                data-pointed={isPointed}
              >
                <span className={styles["peek-text"]} data-line-text="">
                  {line.text}
                  {line.truncated && "…"}
                </span>
                {line.number === pointed.startLine && (
                  <span className={styles["peek-mark"]} data-line-mark="">
                    ← {lineRangeLabel(pointed)}
                  </span>
                )}
              </span>
            )
          })}
        </pre>
      )}
      {excerpt.kind !== "lines" && (
        <p className={styles["peek-note"]}>{noteOf(excerpt, pointed)}</p>
      )}
    </div>,
    document.body,
  )
}

/** 頭の行に添える範囲。抜き書きがあればその範囲、無ければ指した行。 */
function headRangeOf(excerpt: ShownFileExcerpt, pointed: LineRange): string {
  const first = excerpt.kind === "lines" ? excerpt.lines.at(0) : undefined
  const last = excerpt.kind === "lines" ? excerpt.lines.at(-1) : undefined
  return first === undefined || last === undefined
    ? lineRangeLabel(pointed)
    : lineRangeLabel({ kind: "lines", startLine: first.number, endLine: last.number })
}

function lineRangeLabel(lines: LineRange): string {
  return lines.startLine === lines.endLine
    ? `${String(lines.startLine)} 行`
    : `${String(lines.startLine)}〜${String(lines.endLine)} 行`
}

function noteOf(excerpt: Exclude<ShownFileExcerpt, { kind: "lines" }>, pointed: LineRange): string {
  if (excerpt.kind === "out-of-range") {
    return `${String(pointed.startLine)} 行目はいまのファイルに無い（${String(excerpt.lineCount)} 行まで）`
  }
  switch (excerpt.reason) {
    case "too-large":
      return "大きいファイルなので抜き書きを出さない"
    case "binary":
      return "テキストでないので抜き書きを出さない"
  }
}

/** 押せるパスの最後の行の下へ、窓の左右の端からはみ出さないように置く。下が足りなければ上へ。 */
function placeNearAnchor(node: HTMLDivElement | null, anchor: PeekAnchor): void {
  if (node === null) {
    return
  }
  const left = Math.max(
    WINDOW_MARGIN_PX,
    Math.min(anchor.left, window.innerWidth - node.offsetWidth - WINDOW_MARGIN_PX),
  )
  const below = anchor.bottom + GAP_PX
  const fitsBelow = below + node.offsetHeight <= window.innerHeight - WINDOW_MARGIN_PX
  const top = fitsBelow
    ? below
    : Math.max(WINDOW_MARGIN_PX, anchor.top - GAP_PX - node.offsetHeight)
  node.style.left = `${String(left)}px`
  node.style.top = `${String(top)}px`
}
