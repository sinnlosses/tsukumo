import type { Element, Root } from "hast"
import rehypeSanitize from "rehype-sanitize"
import { unified } from "unified"
import { describe, expect, it } from "vitest"

import { REPORT_SANITIZE_SCHEMA } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/sanitize-schema.ts"
import { rehypeStyleAllowlist } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/style-allowlist.ts"

// jsdom は不正な CSS を CSSOM に入れる段で捨てるため、DOM を見ると素通しでも落ちて見える。木の段階で見る。
function sanitizedStyle(style: string): unknown {
  const div: Element = { type: "element", tagName: "div", properties: { style }, children: [] }
  const tree: Root = { type: "root", children: [div] }
  const result = unified()
    .use(rehypeStyleAllowlist)
    .use(rehypeSanitize, REPORT_SANITIZE_SCHEMA)
    .runSync(tree)
  const first = result.children[0]
  return first?.type === "element" ? first.properties["style"] : undefined
}

describe("REPORT_SANITIZE_SCHEMA の style", () => {
  it.each([
    ["CSS エスケープで書いた url(", "background:\\75rl(https://example.invalid/x.png)"],
    ["エスケープを途中に挟んだ url(", "background:u\\72l(https://example.invalid/x.png)"],
    ["image-set", 'background:image-set("https://example.invalid/x.png" 1x)'],
    ["-webkit-image-set", 'background:-webkit-image-set("https://example.invalid/x.png" 1x)'],
    ["src(", 'background:src("https://example.invalid/x.png")'],
  ])("抜け道（%s）は属性ごと落ちる", (_name, style) => {
    expect(sanitizedStyle(style)).toBeUndefined()
  })
})
