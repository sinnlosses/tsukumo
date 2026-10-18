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

function sanitizedImageProperties(properties: Element["properties"]): Element["properties"] {
  const img: Element = { type: "element", tagName: "img", properties, children: [] }
  const result = unified()
    .use(rehypeSanitize, REPORT_SANITIZE_SCHEMA)
    .runSync({ type: "root", children: [img] })
  const first = result.children[0]
  return first?.type === "element" ? first.properties : {}
}

describe("REPORT_SANITIZE_SCHEMA の img の dataChangeRegion", () => {
  it("枠の形の値は通り、形の外の値は属性ごと落ちる", () => {
    expect(
      sanitizedImageProperties({ dataChangeRegion: "29.6,44.6,40.5,10.6" })["dataChangeRegion"],
    ).toBe("29.6,44.6,40.5,10.6")
    expect(
      sanitizedImageProperties({ dataChangeRegion: "1,2,3,x" })["dataChangeRegion"],
    ).toBeUndefined()
  })

  it("img 以外には通さない", () => {
    const div: Element = {
      type: "element",
      tagName: "div",
      properties: { dataChangeRegion: "1,2,3,4" },
      children: [],
    }
    const result = unified()
      .use(rehypeSanitize, REPORT_SANITIZE_SCHEMA)
      .runSync({ type: "root", children: [div] })
    const first = result.children[0]

    expect(first?.type === "element" ? first.properties["dataChangeRegion"] : "x").toBeUndefined()
  })
})

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
