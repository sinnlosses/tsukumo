// Enter で箇条書きと引用の記号を次の行へ続ける。
// 上流は空の箇条書きの行だけ記号を消し、空の引用の行は続けてしまうので、後者だけここで消す。

import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"
import type { EditorState, StateCommand } from "@codemirror/state"

export const continueMarkupOnEnter: StateCommand = (target) => {
  const { state, dispatch } = target
  const selection = state.selection.main
  if (selection.empty && inEmptyQuoteLine(state, selection.head)) {
    const line = state.doc.lineAt(selection.head)
    const from = line.from + line.text.indexOf(">")
    dispatch(
      state.update({
        changes: { from, to: line.to },
        selection: { anchor: from },
        scrollIntoView: true,
        userEvent: "input",
      }),
    )
    return true
  }
  return insertNewlineContinueMarkup(target)
}

/** 行末にキャレットがあり、行が `>` と空白だけで、構文木でも引用の中（コードブロックの外）にあるとき。 */
function inEmptyQuoteLine(state: EditorState, head: number): boolean {
  const line = state.doc.lineAt(head)
  if (head !== line.to || !EMPTY_QUOTE.test(line.text)) {
    return false
  }
  const markPosition = line.from + line.text.indexOf(">")
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(markPosition + 1, -1)
  while (node !== null) {
    if (node.name === "FencedCode") {
      return false
    }
    if (node.name === "Blockquote") {
      return true
    }
    node = node.parent
  }
  return false
}

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>

/** 記号と空白だけの引用の行（入れ子の `> >` を含む）。 */
const EMPTY_QUOTE = /^\s*(?:>\s*)+$/
