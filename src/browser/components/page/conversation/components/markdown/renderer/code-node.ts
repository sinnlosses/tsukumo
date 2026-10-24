// フェンス付きコードの hast（`pre > code`）から、描く側が読む値を取り出す。

import type { Element } from "hast"

import { decodeMarks, type CodeMark } from "../../../../../../../shared/report/code-mark.ts"
import { optionalString } from "../../../../../../../shared/utils/optional-string.ts"
import { CODE_FILE_NAME_PROPERTY, CODE_MARKS_PROPERTY } from "./code-file-name.ts"

/** フェンスの `marks`。`rehypeCodeFileName` が属性に移し、モデルが書いた値なので読めなければ無いものとして扱う。 */
export function codeMarks(codeNode: Element): readonly CodeMark[] {
  const token = optionalString(codeNode.properties[CODE_MARKS_PROPERTY])
  return token === undefined ? [] : decodeMarks(token)
}

/** フェンスの中身そのまま。末尾に付く1つの改行（CommonMark がフェンスの終わりに添えるもの）だけ落とす。 */
export function codeSourceText(codeNode: Element): string {
  return hastText(codeNode).replace(/\n$/, "")
}

export function findCodeChild(node: Element | undefined): Element | undefined {
  return node?.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "code",
  )
}

/**
 * フェンスに書かれたファイル名。`rehypeCodeFileName` が属性に移し、サニタイザが通したものだけがここに来る。
 * モデルが書いた文字列なので、型の上では何が入っていてもよい形で受ける。
 */
export function codeFileName(codeNode: Element): string | undefined {
  return optionalString(codeNode.properties[CODE_FILE_NAME_PROPERTY])
}

export function codeLanguage(codeNode: Element): string | undefined {
  const match = (codeNode.properties.className ?? []).find((name) => name.startsWith("language-"))
  return match?.slice("language-".length)
}

/** hast の要素の中身を、素のテキストとして連結する（highlight.js が足した `<span>` も無視する）。 */
export function hastText(node: Element): string {
  return node.children.map(hastNodeText).join("")
}

function hastNodeText(node: Element["children"][number]): string {
  if (node.type === "text") {
    return node.value
  }
  return node.type === "element" ? node.children.map(hastNodeText).join("") : ""
}
