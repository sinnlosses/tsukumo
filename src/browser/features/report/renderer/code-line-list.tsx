// 前後の見比べの片側のコードを行ごとに描く。向かいの塊に無い行は空きの行で埋め、変わった行と新しく足した行に印を付ける。

import type { Element, ElementContent } from "hast"
import { createContext, createElement, type ReactElement, type ReactNode } from "react"

import type { CodeLine } from "./code-line.ts"
import type { SideLine, SideLineDiff } from "./line-diff.ts"
import styles from "./report-notation.module.css"

/** 前後の見比べの片側の行の並び。hast の属性には載せず、塊の外から行の描き手まで運ぶ。 */
export const CodeLineDiffContext = createContext<SideLineDiff | undefined>(undefined)

type CompareLineMark = "before" | "after" | "added"

export function CodeLines(props: {
  readonly lines: readonly CodeLine[]
  readonly lineDiff: SideLineDiff
}): ReactElement {
  const { side } = props.lineDiff
  return (
    <>
      {props.lineDiff.lines.map((row, position) =>
        row.kind === "gap" ? (
          <span
            key={`gap-${String(position)}`}
            className={styles["code-line"]}
            data-compare="gap"
            aria-hidden="true"
          />
        ) : (
          <CodeLineRow
            key={row.index + 1}
            line={props.lines[row.index] ?? []}
            compare={compareLineMark(side, row)}
          />
        ),
      )}
    </>
  )
}

function compareLineMark(
  side: SideLineDiff["side"],
  row: Extract<SideLine, { readonly kind: "line" }>,
): CompareLineMark | undefined {
  if (row.change === "same") {
    return undefined
  }
  if (side === "before") {
    return "before"
  }
  return row.change === "added" ? "added" : "after"
}

function CodeLineRow(props: {
  readonly line: CodeLine
  /** 印の無い行は `undefined`。 */
  readonly compare?: CompareLineMark
}): ReactElement {
  return (
    <span data-compare={props.compare} className={styles["code-line"]}>
      <span className={styles["code-line-text"]}>
        {props.line.map(hastToReact)}
        {props.compare === "added" && <span className={styles["code-line-new"]}>新設</span>}
      </span>
    </span>
  )
}

/** highlight.js が足す要素は class だけを持つ `<span>`。それ以外の属性は運ばない。 */
function hastToReact(node: ElementContent, index: number): ReactNode {
  if (node.type === "text") {
    return node.value
  }
  if (node.type !== "element") {
    return undefined
  }
  return createElement(
    node.tagName,
    { key: index, className: classNames(node) },
    ...node.children.map(hastToReact),
  )
}

function classNames(node: Element): string | undefined {
  const names = node.properties.className
  return Array.isArray(names) ? names.map(String).join(" ") : undefined
}
