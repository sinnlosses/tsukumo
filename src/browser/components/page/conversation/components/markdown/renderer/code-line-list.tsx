// フェンス付きコードの中身を行ごとに描く。印の行（`marks`）の地とラベルと、無印の長い範囲の畳みと、shell の出力の行の字の色と、`diff` の行の中の違う語の地を持つ。

import clsx from "clsx"
import type { Element, ElementContent } from "hast"
import { createElement, useState, type ReactElement, type ReactNode } from "react"

import {
  foldedRanges,
  readMarkLines,
  type CodeMark,
  type LineRange,
} from "../../../../../../../shared/report/code-mark.ts"
import { Button } from "../../../../../ui/button/button.tsx"
import { diffLineSide, markDiffSign, type CodeLine } from "./code-line.ts"
import type { DiffLineWords, DiffWordRanges } from "./diff-pair.ts"
import { markDiffWords } from "./diff-word-mark.ts"
import styles from "./report-notation.module.css"
import type { ShellLineKind } from "./shell-line.ts"

export function CodeLines(props: {
  readonly lines: readonly CodeLine[]
  readonly marks: readonly CodeMark[]
  /** shell の塊の行ごとの種別。分けない塊は `undefined`。 */
  readonly kinds: readonly ShellLineKind[] | undefined
  /** `diff` の対の行の、違う語の区間。 */
  readonly wordRanges: DiffWordRanges
  readonly diff: boolean
  /** 1 行目がファイルの何行目か。分かるときだけ行番号の列を出す。 */
  readonly startLine: number | undefined
}): ReactElement {
  const [opened, setOpened] = useState<readonly number[]>([])
  const folds = foldedRanges(props.lines.length, props.marks)
  const labels = markLabels(props.marks)

  const rows = props.lines.flatMap((line, index): readonly ReactNode[] => {
    const number = index + 1
    const fold = folds.find((range) => number >= range.start && number <= range.end)
    if (fold !== undefined && !opened.includes(fold.start)) {
      return number === fold.start ? [foldRow(fold, setOpened)] : []
    }
    return [
      <CodeLineRow
        key={number}
        line={line}
        number={number}
        fileLine={props.startLine === undefined ? undefined : props.startLine + index}
        marks={props.marks}
        label={labels.get(number)}
        kind={props.kinds?.[index]}
        wordRange={props.wordRanges.get(index)}
        diff={props.diff}
      />,
    ]
  })

  return <>{rows}</>
}

function foldRow(
  range: LineRange,
  open: (update: (current: readonly number[]) => readonly number[]) => void,
): ReactElement {
  return (
    <Button
      key={`fold-${String(range.start)}`}
      variant="ghost-hover-accent"
      size="label"
      pressed="none"
      disabled={false}
      disclosure={{ kind: "expander", expanded: false }}
      className={styles["code-fold"]}
      onClick={() => {
        open((current) => [...current, range.start])
      }}
    >
      {`${String(range.end - range.start + 1)} 行を畳んだ`}
    </Button>
  )
}

function CodeLineRow(props: {
  /** `diff` の塊の行か。文脈の行（先頭が空白）にも記号の列を空けて、`+`・`-` の行と字を揃える。 */
  readonly diff: boolean
  readonly line: CodeLine
  readonly number: number
  /** ファイルの何行目か。行番号の列を出さないときは `undefined`。 */
  readonly fileLine: number | undefined
  readonly marks: readonly CodeMark[]
  readonly label: string | undefined
  readonly kind: ShellLineKind | undefined
  readonly wordRange: DiffLineWords | undefined
}): ReactElement {
  const marked = props.marks.some((mark) => {
    const range = readMarkLines(mark.lines)
    return range !== undefined && props.number >= range.start && props.number <= range.end
  })
  const side = diffLineSide(props.line)
  const wordLine =
    props.wordRange === undefined ? props.line : diffWordLine(props.line, props.wordRange)
  const hasSign =
    side !== undefined || (props.diff && props.line.map(plainText).join("").startsWith(" "))
  const diffLine = hasSign ? diffSignLine(wordLine) : wordLine
  return (
    <span
      data-line={props.fileLine}
      className={clsx(
        styles["code-line"],
        marked && styles["code-line-mark"],
        props.kind === "output" && styles["code-line-output"],
        side === "added" && styles["code-line-added"],
        side === "removed" && styles["code-line-removed"],
      )}
    >
      <span className={styles["code-line-text"]}>
        {props.kind === "output" ? props.line.map(plainText) : diffLine.map(hastToReact)}
      </span>
      {props.label !== undefined && (
        <span className={styles["code-mark-label"]}>{props.label}</span>
      )}
    </span>
  )
}

function diffSignLine(line: CodeLine): CodeLine {
  return markDiffSign(line, styles["code-line-sign"])
}

function diffWordLine(line: CodeLine, words: DiffLineWords): CodeLine {
  return markDiffWords(
    line,
    words.ranges,
    words.side === "added" ? styles["code-diff-added"] : styles["code-diff-removed"],
  )
}

/** 印ごとに、ラベルを出す行（印の最初の行）。 */
function markLabels(marks: readonly CodeMark[]): ReadonlyMap<number, string> {
  return new Map(
    marks.flatMap((mark) => {
      const range = readMarkLines(mark.lines)
      return range === undefined || mark.label.trim() === ""
        ? []
        : [[range.start, mark.label] as const]
    }),
  )
}

/** 出力の行は色付けを外し、行の字の色（`--ink-soft`）で揃える。 */
function plainText(node: ElementContent): string {
  if (node.type === "text") {
    return node.value
  }
  return node.type === "element" ? node.children.map(plainText).join("") : ""
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
