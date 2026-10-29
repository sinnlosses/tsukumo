import { describe, expect, it } from "vitest"

import { readFigureFence } from "../../../../src/server/session-driver/core/body-figure-fence.ts"

describe("readFigureFence", () => {
  it("名前: 数 の行を、名前の列と値の列の plot に読む（コメントと unit も読む）", () => {
    const plot = readFigureFence(
      [
        "question: どの段が長いか",
        "relation: compare   # compare / rank",
        "unit: 分",
        "data:",
        "  計画: 4",
        "  実装: 31",
      ].join("\n"),
    )

    expect(plot?.relation).toBe("compare")
    expect(plot?.data).toEqual([
      { name: "項目", type: "N", values: ["計画", "実装"] },
      { name: "分", type: "Q", values: [4, 31] },
    ])
  })

  it("trend の名前の列は T、keys で上書きできる", () => {
    const trend = readFigureFence("question: 推移\nrelation: trend\ndata:\n  1月: 3\n  2月: 5")
    const keyed = readFigureFence(
      "question: 順位\nrelation: rank\nkeys: O\ndata:\n  小: 1\n  大: 2",
    )

    expect(trend?.data[0]?.type).toBe("T")
    expect(keyed?.data[0]?.type).toBe("O")
  })

  it("x, y の行は Q 2 列、数だけの行は Q 1 列", () => {
    const pairs = readFigureFence("question: 相関\nrelation: correlate\ndata:\n  1, 2\n  3, 5")
    const singles = readFigureFence("question: 分布\nrelation: distribution\ndata:\n  1\n  2\n  9")

    expect(pairs?.data.map((column) => column.name)).toEqual(["x", "y"])
    expect(singles?.data).toHaveLength(1)
  })

  it("form を書けば plot に載る", () => {
    expect(readFigureFence("question: q\nrelation: compare\nform: bar\ndata:\n  a: 1")?.form).toBe(
      "bar",
    )
  })

  it.each([
    ["data が無い", "question: q\nrelation: compare"],
    ["question が無い", "relation: compare\ndata:\n  a: 1"],
    ["relation が 8 語の外", "question: q\nrelation: 架空\ndata:\n  a: 1"],
    ["Q の値が数でない", "question: q\nrelation: compare\ndata:\n  a: たくさん"],
    ["行の形が混ざる", "question: q\nrelation: compare\ndata:\n  a: 1\n  2"],
    ["keys が N/O/T の外", "question: q\nrelation: compare\nkeys: Q\ndata:\n  a: 1"],
    ["data が空", "question: q\nrelation: compare\ndata:"],
  ])("%s は読めない", (_name, content) => {
    expect(readFigureFence(content)).toBeUndefined()
  })
})
