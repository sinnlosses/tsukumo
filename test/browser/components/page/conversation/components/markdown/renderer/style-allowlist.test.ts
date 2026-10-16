import type { Element, Root } from "hast"
import { describe, expect, it } from "vitest"

import { rehypeStyleAllowlist } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/style-allowlist.ts"

function styleSurvives(style: string): boolean {
  const tree: Root = {
    type: "root",
    children: [{ type: "element", tagName: "div", properties: { style }, children: [] }],
  }
  const first = rehypeStyleAllowlist()(tree).children[0]
  return first?.type === "element" && first.properties["style"] === style
}

describe("style の許可", () => {
  it.each([
    ["CSS エスケープで書いた url(", "background-color:\\75rl(https://example.invalid/x.png)"],
    ["エスケープを途中に挟んだ url(", "background-color:u\\72l(https://example.invalid/x.png)"],
    ["image-set", 'background-color:image-set("https://example.invalid/x.png" 1x)'],
    ["-webkit-image-set", 'background-color:-webkit-image-set("https://example.invalid/x.png" 1x)'],
    ["src(", 'background-color:src("https://example.invalid/x.png")'],
    ["url(", "background-color:url(https://example.invalid/x.png)"],
    ["大文字の URL(", "background-color:URL(https://example.invalid/x.png)"],
    ["コメントで関数名を割る形", "background-color:ur/**/l(https://example.invalid/x.png)"],
    ["@import", "width:1px;@import 'https://example.invalid/x.css'"],
    ["expression(", "width:expression(alert(1))"],
    ["javascript:", "width:javascript:alert(1)"],
    ["タグの混入", "width:1px</style><script>"],
    ["載っていないプロパティ(background)", "background:red"],
    ["載っていないプロパティ(position)", "position:fixed"],
    ["載っていないプロパティ(transform)", "transform:rotate(1deg)"],
    ["載っていないプロパティ(content)", "content:none"],
    ["未知の関数", "width:env(safe-area-inset-left)"],
    ["!important", "width:1px !important"],
    ["複数宣言のうち1つだけ悪い", "width:1px;background:red;height:2px"],
    ["入れ子の中の未知の関数", "width:calc(1px + attr(data-x))"],
    ["プロパティの無い宣言", "red"],
    ["値の無い宣言", "width:"],
    ["空文字", ""],
    ["空白と区切りだけ", " ; ; "],
  ])("落とす: %s", (_name, style) => {
    expect(styleSurvives(style)).toBe(false)
  })

  it.each([
    ["割合の幅", "width: 89%"],
    ["flex の数値3つ", "flex: 20000 0 0"],
    ["段組み", "display:grid;grid-template-columns:1fr 1fr"],
    ["rgb の slash", "color: rgb(1 2 3 / 50%)"],
    ["末尾の ;", "width: 10px;"],
    ["空白と改行", "  display : flex ;\n  gap : 4px  "],
    ["大文字小文字", "WIDTH: 10PX; Display: Grid"],
    ["入れ子の括弧", "width: calc(100% - (2px + 3px))"],
    ["var", "color: var(--accent)"],
    ["repeat と minmax", "grid-template-columns: repeat(2, minmax(0, 1fr))"],
    ["border の細目", "border-top-width: 1px"],
    ["margin の細目", "margin-inline: 4px"],
  ])("通す: %s", (_name, style) => {
    expect(styleSurvives(style)).toBe(true)
  })
})

describe("rehypeStyleAllowlist", () => {
  function div(properties: Element["properties"], children: Element["children"] = []): Element {
    return { type: "element", tagName: "div", properties, children }
  }

  function run(tree: Root): Root {
    return rehypeStyleAllowlist()(tree)
  }

  it("許さない宣言があれば style が属性ごと消え、ほかの属性は残る", () => {
    const tree: Root = {
      type: "root",
      children: [div({ className: ["a"], id: "x", style: "width:1px;background:red" })],
    }

    expect(run(tree).children).toEqual([div({ className: ["a"], id: "x" })])
  })

  it("通る style はそのまま残る", () => {
    const tree: Root = { type: "root", children: [div({ style: "width: 89%" })] }

    expect(run(tree)).toEqual(tree)
  })

  it("入れ子の要素の style も検査し、テキストはそのまま残る", () => {
    const inner = div({ style: "width:u\\72l(x)" }, [{ type: "text", value: "中身" }])
    const tree: Root = { type: "root", children: [div({ style: "width:1px" }, [inner])] }

    expect(run(tree).children).toEqual([
      div({ style: "width:1px" }, [div({}, [{ type: "text", value: "中身" }])]),
    ])
  })

  it("元の木は書き換えない", () => {
    const tree: Root = { type: "root", children: [div({ style: "background:red" })] }

    run(tree)

    expect(tree.children).toEqual([div({ style: "background:red" })])
  })
})
