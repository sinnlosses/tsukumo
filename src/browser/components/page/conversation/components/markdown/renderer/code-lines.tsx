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
import type { CodeLine } from "./code-line.ts"
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
        marks={props.marks}
        label={labels.get(number)}
        kind={props.kinds?.[index]}
        wordRange={props.wordRanges.get(index)}
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
      ariaLabel={undefined}
      disclosure={{ kind: "expander", expanded: false }}
      ariaHasPopup={undefined}
      title={undefined}
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
  readonly line: CodeLine
  readonly number: number
  readonly marks: readonly CodeMark[]
  readonly label: string | undefined
  readonly kind: ShellLineKind | undefined
  readonly wordRange: DiffLineWords | undefined
}): ReactElement {
  const marked = props.marks.some((mark) => {
    const range = readMarkLines(mark.lines)
    return range !== undefined && props.number >= range.start && props.number <= range.end
  })
  return (
    <span
      className={clsx(
        styles["code-line"],
        marked && styles["code-line-mark"],
        props.kind === "output" && styles["code-line-output"],
      )}
    >
      <span className={styles["code-line-text"]}>
        {props.kind === "output"
          ? props.line.map(plainText)
          : diffWordLine(props.line, props.wordRange).map(hastToReact)}
      </span>
      {props.label !== undefined && (
        <span className={styles["code-mark-label"]}>{props.label}</span>
      )}
    </span>
  )
}

function diffWordLine(line: CodeLine, words: DiffLineWords | undefined): CodeLine {
  return words === undefined
    ? line
    : markDiffWords(
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
    return null
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
