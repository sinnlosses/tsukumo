// 入力欄のマークダウンエディタで、キャレットの無い行から隠す記号の範囲を構文木から拾う。
// キャレット（選択範囲）が掛かる行の記号は返さない。

import { syntaxTree } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"

/**
 * 隠す・置き換える範囲。
 * `hidden` は字を消し、`bullet` は箇条書きの印を `•` に替え、`link-label` はリンクの字に行き先を添える。
 * `quote-line` は引用の行の頭で、キャレットの行にも出す。
 */
export type ConcealedMark =
  | { readonly kind: "hidden"; readonly from: number; readonly to: number }
  | { readonly kind: "bullet"; readonly from: number; readonly to: number }
  | {
      readonly kind: "link-label"
      readonly from: number
      readonly to: number
      readonly url: string
    }
  | { readonly kind: "quote-line"; readonly from: number }

export function concealedMarks(state: EditorState): readonly ConcealedMark[] {
  const caretLines = state.selection.ranges.map((range) => ({
    first: state.doc.lineAt(range.from).number,
    last: state.doc.lineAt(range.to).number,
  }))
  const context: Context = {
    state,
    touchesCaret: (from, to) => {
      const first = state.doc.lineAt(from).number
      const last = state.doc.lineAt(to).number
      return caretLines.some((lines) => lines.first <= last && first <= lines.last)
    },
    insideQuote: false,
  }
  return marksIn(syntaxTree(state).topNode, context)
}

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"]

type Context = {
  readonly state: EditorState
  readonly touchesCaret: (from: number, to: number) => boolean
  readonly insideQuote: boolean
}

function marksIn(node: SyntaxNode, context: Context): readonly ConcealedMark[] {
  switch (node.name) {
    case "HeaderMark":
    case "QuoteMark":
      return hidden(node.from, withTrailingSpace(node.to, context.state), context)
    case "EmphasisMark":
    case "StrikethroughMark":
    case "CodeMark":
      return hidden(node.from, node.to, context)
    case "ListMark":
      return node.parent?.parent?.name === "BulletList" && !context.touchesCaret(node.from, node.to)
        ? [{ kind: "bullet", from: node.from, to: node.to }]
        : []
    case "FencedCode":
      return fencedCodeMarks(node, context)
    case "Link":
      return linkMarks(node, context)
    case "Blockquote":
      return [
        ...(context.insideQuote ? [] : quoteLines(node, context.state)),
        ...childMarks(node, { ...context, insideQuote: true }),
      ]
    default:
      return childMarks(node, context)
  }
}

function childMarks(node: SyntaxNode, context: Context): readonly ConcealedMark[] {
  return childrenOf(node).flatMap((child) => marksIn(child, context))
}

/** 開きと閉じの行を、キャレットがフェンスのどこかに掛かれば両方出し、掛からなければ両方隠す。 */
function fencedCodeMarks(node: SyntaxNode, context: Context): readonly ConcealedMark[] {
  if (context.touchesCaret(node.from, node.to)) {
    return []
  }
  return childrenOf(node)
    .filter((child) => child.name === "CodeMark")
    .flatMap((mark) => hidden(mark.from, context.state.doc.lineAt(mark.from).to, context))
}

/** 行き先のあるリンクだけ、`[` と `](行き先)` を隠して字に行き先を添える。 */
function linkMarks(node: SyntaxNode, context: Context): readonly ConcealedMark[] {
  const children = childrenOf(node)
  const brackets = children.filter((child) => child.name === "LinkMark")
  const open = brackets[0]
  const close = brackets[1]
  const url = children.find((child) => child.name === "URL")
  if (
    open === undefined ||
    close === undefined ||
    url === undefined ||
    context.touchesCaret(node.from, node.to)
  ) {
    return childMarks(node, context)
  }
  const label = children.filter((child) => child.from >= open.to && child.to <= close.from)
  return [
    ...hidden(open.from, open.to, context),
    ...label.flatMap((child) => marksIn(child, context)),
    {
      kind: "link-label",
      from: open.to,
      to: close.from,
      url: context.state.sliceDoc(url.from, url.to),
    },
    ...hidden(close.from, node.to, context),
  ]
}

function quoteLines(node: SyntaxNode, state: EditorState): readonly ConcealedMark[] {
  const first = state.doc.lineAt(node.from).number
  const last = state.doc.lineAt(node.to).number
  return Array.from({ length: last - first + 1 }, (_, index): ConcealedMark => ({
    kind: "quote-line",
    from: state.doc.line(first + index).from,
  }))
}

/** 改行をまたぐ範囲は隠さない。 */
function hidden(from: number, to: number, context: Context): readonly ConcealedMark[] {
  if (
    from >= to ||
    context.state.doc.lineAt(from).number !== context.state.doc.lineAt(to).number ||
    context.touchesCaret(from, to)
  ) {
    return []
  }
  return [{ kind: "hidden", from, to }]
}

function withTrailingSpace(to: number, state: EditorState): number {
  return state.sliceDoc(to, to + 1) === " " ? to + 1 : to
}

function childrenOf(node: SyntaxNode): readonly SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child)
  }
  return children
}
