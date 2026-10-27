import { describe, expect, it } from "vitest"

import { missingPicks, parseDomTreeByRoot } from "./dom-pick.ts"

const ACTUAL = parseDomTreeByRoot(
  {
    main: [
      {
        tag: "section",
        attributes: { "aria-label": "依頼", "data-kind": "request" },
        children: [
          { tag: "h2", children: ["依頼"] },
          { tag: "p", children: ["架空の依頼の文"] },
        ],
      },
      {
        tag: "section",
        children: [{ tag: "header", children: [{ tag: "p", children: ["最終レポート"] }] }],
      },
      { tag: "details", children: [{ tag: "summary", children: ["経過 1 件"] }] },
    ],
    character: [{ tag: "div", attributes: { role: "button" }, children: ["書けたよ！"] }],
  },
  "写し",
)

function missing(picked: unknown): readonly string[] {
  return missingPicks(parseDomTreeByRoot(picked, "期待値"), ACTUAL)
}

describe("missingPicks", () => {
  it("包む要素と間の節を飛ばし、文書順に並んだ節を見つける", () => {
    expect(
      missing({
        main: [
          { tag: "h2", children: ["依頼"] },
          "最終レポート",
          { tag: "summary", children: ["経過 1 件"] },
        ],
        character: ["書けたよ！"],
      }),
    ).toEqual([])
  })

  it("並びが文書順と逆なら、後ろの節を見つからなかったとする", () => {
    expect(missing({ main: ["最終レポート", "架空の依頼の文"] })).toEqual([
      'main[1]: "架空の依頼の文"',
    ])
  })

  it("要素は期待値に書いた属性だけを見て、値が違えば当たらない", () => {
    expect(
      missing({
        main: [
          { tag: "section", attributes: { "aria-label": "依頼" } },
          { tag: "section", attributes: { "data-kind": "report" } },
        ],
      }),
    ).toEqual(['main[1]: {"tag":"section","attributes":{"data-kind":"report"},"children":[]}'])
  })

  it("子はその要素の子孫の中でだけ探し、見つからない子まで降りて名指す", () => {
    expect(
      missing({
        main: [
          {
            tag: "section",
            attributes: { "aria-label": "依頼" },
            children: [{ tag: "p", children: ["最終レポート"] }],
          },
        ],
      }),
    ).toEqual(['main[0].children[0].children[0]: "最終レポート"'])
  })

  it("文字は節の文字と完全に一致したときだけ当たる", () => {
    expect(missing({ character: ["書けた"] })).toEqual(['character[0]: "書けた"'])
  })

  it("写しに無い部分木の名前を名指す", () => {
    expect(missing({ sidebar: ["覚えていること"] })).toEqual([
      "sidebar: 写しに無い部分木の名前（場面の domRoots に足す）",
    ])
  })
})

describe("parseDomTreeByRoot", () => {
  it("要素に名前が無ければ、どこの形が合わないかを添えて投げる", () => {
    expect(() => parseDomTreeByRoot({ main: [{ children: [] }] }, "期待値")).toThrow(
      /^期待値 が DOM の木の形でない/,
    )
  })
})
