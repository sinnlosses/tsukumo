import { describe, expect, it } from "vitest"

import { fencedFigureCaptioned, markdownOf, text } from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
  it("コードと mermaid はフェンスで囲み、中のバッククォートより長いフェンスにする", () => {
    expect(
      markdownOf({
        kind: "code",
        language: "diff",
        path: "src/dummy.ts",
        source: "-a\n+b\n",
        marks: [],
        fold: "",
        aside: "",
      }),
    ).toBe("```diff src/dummy.ts\n-a\n+b\n```")
    expect(
      markdownOf({
        kind: "code",
        language: "md",
        path: "",
        source: "```ts\nx\n```",
        marks: [],
        fold: "",
        aside: "",
      }),
    ).toBe("````md\n```ts\nx\n```\n````")
    expect(
      markdownOf({
        kind: "mermaid",
        title: "架空の図",
        source: "sequenceDiagram\n  A ->> B: x",
        fold: "",
        aside: "",
      }),
    ).toBe(
      fencedFigureCaptioned(
        "```mermaid\nsequenceDiagram\n  autonumber\n  A ->> B: x\n```",
        "架空の図",
      ),
    )
  })

  describe("塊の文字の逃がし方", () => {
    it.each([
      [
        "inline code・太字・リンクはそのまま通す",
        "**架空の太字** と `a < b` と [架空のリンク](https://example.com)",
        "**架空の太字** と `a < b` と [架空のリンク](https://example.com)",
      ],
      [
        "改行を空白に畳み、inline code の外の < を逃がす",
        "架空の一行目\n  架空の<b>二行目</b>",
        "架空の一行目 架空の&lt;b>二行目&lt;/b>",
      ],
      ["行頭の見出しの記法を逃がす", "# 架空の見出し", "\\# 架空の見出し"],
      ["行頭の引用の記法を逃がす", "> 架空の引用", "\\> 架空の引用"],
      ["行頭の箇条書きの記法を逃がす", "- 架空の項目", "\\- 架空の項目"],
      ["行頭の番号付きの記法を逃がす", "1. 架空の手順", "1\\. 架空の手順"],
      ["行頭の表の記法を逃がす", "| 架空の列 |", "\\| 架空の列 |"],
      ["行頭の3連バッククォートのフェンスを逃がす", "```ts", "\\```ts"],
      ["行頭の区切り線の記法を逃がす", "---", "\\---"],
      [
        "行頭が3連バッククォートでも、同じ行にバッククォートがあればフェンスでなく inline code なので逃がさない",
        "```x``` と書く",
        "```x``` と書く",
      ],
    ])("%s", (_, source, expected) => {
      expect(markdownOf(text(source))).toBe(expected)
    })

    it("箇条書きの項目の行頭も逃がす", () => {
      expect(
        markdownOf({
          kind: "list",
          style: "bullet",
          items: [{ label: "", text: "## 架空", done: false }],
          fold: "",
          aside: "",
        }),
      ).toBe("- \\## 架空")
    })
  })
})
