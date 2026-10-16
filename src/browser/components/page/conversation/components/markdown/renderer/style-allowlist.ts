// レポートの HTML に書かれた `style` 属性を、許したプロパティと関数だけで書かれたものに絞る。
// 通らない値は属性ごと消す。
//
// rehype-sanitize の属性値は文字列か RegExp しか受けず関数を渡せないので、検査は `rehypeStyleAllowlist` として `rehypeSanitize` の直前に差す。
// CSS のエスケープ・コメント・文字列は、字句を解釈せずに丸ごと不許可にする（関数名や `url(` を隠せる書き方をすべて塞ぐため）。

import type { Element, ElementContent, Root, RootContent } from "hast"

const ALLOWED_PROPERTY_PATTERN =
  /^(?:display|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|color|background-color|font-size|font-weight|font-style|line-height|text-align|text-decoration|vertical-align|white-space|overflow|overflow-x|overflow-y|opacity|border-radius|flex(?:-[a-z]+)?|grid(?:-[a-z]+)*|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?)$/

const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  "calc",
  "minmax",
  "repeat",
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "var",
])

/** これを含む値は、解釈せずに丸ごと不許可にする（エスケープ・コメント・文字列・`@` 規則・タグ・ブロック）。 */
const FORBIDDEN_CHARACTER_PATTERN = /[\\"'@<{}]|\/\*/

const FUNCTION_NAME_PATTERN = /([-\w]*)\(/g

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
  if (FORBIDDEN_CHARACTER_PATTERN.test(value)) {
    return false
  }

  const declarations = value.split(";").filter((declaration) => declaration.trim() !== "")
  return declarations.length > 0 && declarations.every(isAllowedDeclaration)
}

function isAllowedDeclaration(declaration: string): boolean {
  const colon = declaration.indexOf(":")
  if (colon < 0) {
    return false
  }

  const property = declaration.slice(0, colon).trim().toLowerCase()
  const value = declaration.slice(colon + 1).trim()
  return (
    ALLOWED_PROPERTY_PATTERN.test(property) &&
    value !== "" &&
    !value.includes("!") &&
    [...value.matchAll(FUNCTION_NAME_PATTERN)].every(([, name]) => isAllowedFunction(name ?? ""))
  )
}

/** 名前の無い `(`（`calc(1px + (2px))` の入れ子の括弧）は、関数ではなくただの括弧。 */
function isAllowedFunction(name: string): boolean {
  return name === "" || ALLOWED_FUNCTIONS.has(name.toLowerCase())
}
