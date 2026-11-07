// レポートの HTML に書かれた `style` 属性を、tsukumo が棒・目盛・点を置くために組む形だけに絞る。
// 通らない値は属性ごと消す。
//
// 通すのは `width` / `margin-left` の割合と、`flex` の数値3つだけ。
// 値は数字と `%` だけなので、関数・エスケープ・コメント・文字列は入り込めない。
//
// rehype-sanitize の属性値は文字列か RegExp しか受けず、宣言ごとの検査を書けないので、`rehypeSanitize` の直前に差す。

import type { Element, ElementContent, Root, RootContent } from "hast"

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:e[+-]?\d+)?`

const ALLOWED_DECLARATION_PATTERN = new RegExp(
  String.raw`^(?:(?:width|margin-left):\s*${NUMBER}%|flex:\s*${NUMBER}\s+0\s+0)$`,
)

/** `style` が許可を通らない要素から、その属性を取り除いた木を返す。 */
export function rehypeStyleAllowlist(): (tree: Root) => Root {
  return (tree) => ({
    ...tree,
    children: tree.children.map((child) => restrictContent(child)),
  })
}

function restrictContent(node: ElementContent): ElementContent
function restrictContent(node: RootContent): RootContent
function restrictContent(node: RootContent): RootContent {
  return node.type === "element" ? restrictElement(node) : node
}

function restrictElement(element: Element): Element {
  const { style, ...rest } = element.properties
  return {
    ...element,
    properties: typeof style === "string" && isAllowedStyle(style) ? element.properties : rest,
    children: element.children.map((child) => restrictContent(child)),
  }
}

function isAllowedStyle(value: string): boolean {
  const declarations = value.split(";").filter((declaration) => declaration.trim() !== "")
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => ALLOWED_DECLARATION_PATTERN.test(declaration.trim()))
  )
}
