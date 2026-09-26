import { describe, expect, it } from "bun:test"

import {
  type ReportBlock,
  type ReportSection,
  reportSectionsMarkdown,
  reportSectionsOfBody,
} from "../../src/shared/report-block.ts"

// フィクスチャはすべて手で書いた架空の本文（docs/coding-standards.md「会話内容の扱い」）。

const section = (blocks: readonly ReportBlock[], heading = ""): ReportSection => ({
  heading,
  blocks,
})
const markdownOf = (block: ReportBlock): string => reportSectionsMarkdown([section([block])])
const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "" })

describe("reportSectionsOfBody", () => {
  it("空白だけの本文は節を持たない", () => {
    expect(reportSectionsOfBody("")).toEqual([])
    expect(reportSectionsOfBody(" \n\n ")).toEqual([])
  })

  it("本文は見出しの無い節1つの逃げ道の塊になる（頭の空行と末尾の空白だけを落とす）", () => {
    expect(reportSectionsOfBody("\n\n    架空の字下げ\n\n架空の本文。  \n")).toEqual([
      {
        heading: "",
        blocks: [{ kind: "markdown", markdown: "    架空の字下げ\n\n架空の本文。", fold: "" }],
      },
    ])
  })
})

describe("reportSectionsMarkdown", () => {
  it("逃げ道の塊は中身をそのまま出し、本文から畳んだ節は元の本文と同じ Markdown になる", () => {
    const body = '## 架空の見出し\n\n<div class="note">架空の注記</div>\n\n- 架空の項目'

    expect(reportSectionsMarkdown(reportSectionsOfBody(body))).toBe(body)
    expect(reportSectionsMarkdown([])).toBe("")
  })

  it("節の見出しは ## で出し、塊と節は空行で区切る。空の見出し・空の塊は置かない", () => {
    const sections = [
      section([text("架空の一。"), text(" ")], "架空の節"),
      section([{ kind: "markdown", markdown: "", fold: "" }], ""),
      section([text("架空の二。")], "架空の次の節"),
    ]

    expect(reportSectionsMarkdown(sections)).toBe(
      "## 架空の節\n\n架空の一。\n\n## 架空の次の節\n\n架空の二。",
    )
  })

  it("箇条書き・番号付き・チェックリストを組む", () => {
    const items = [
      { text: "架空の一", done: true },
      { text: "架空の二", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "bullet", items, fold: "" })).toBe(
      "- 架空の一\n- 架空の二",
    )
    expect(markdownOf({ kind: "list", style: "ordered", items, fold: "" })).toBe(
      "1. 架空の一\n2. 架空の二",
    )
    expect(markdownOf({ kind: "list", style: "check", items, fold: "" })).toBe(
      "- [x] 架空の一\n- [ ] 架空の二",
    )
  })

  it("表は太字1行の見出しのあとに GFM の表で組み、状態のセルはバッジにする", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "架空の表",
      columns: ["項目", "結果"],
      rows: [
        ["架空の a|b", { status: "ok", text: "通過" }],
        ["架空の c", { status: "ng", text: "失敗" }],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "**架空の表**",
        "",
        "| 項目 | 結果 |",
        "| --- | --- |",
        '| 架空の a\\|b | <span class="badge badge-ok">通過</span> |',
        '| 架空の c | <span class="badge badge-ng">失敗</span> |',
      ].join("\n"),
    )
  })

  it("note は種別の class の塊で、中に Markdown を入れるので内側の前後に空行を空ける", () => {
    expect(markdownOf({ kind: "note", tone: "warn", text: "架空の注意", fold: "" })).toBe(
      '<div class="note note-warn">\n\n架空の注意\n\n</div>',
    )
    expect(markdownOf({ kind: "note", tone: "info", text: "架空の情報", fold: "" })).toBe(
      '<div class="note">\n\n架空の情報\n\n</div>',
    )
  })

  it("stats は数の塊で、HTML の中なので値とラベルを HTML として逃がす", () => {
    const stats: ReportBlock = {
      kind: "stats",
      items: [
        { value: "312", label: "架空の<件数>" },
        { value: "0", label: "架空の失敗" },
      ],
      fold: "",
    }

    expect(markdownOf(stats)).toBe(
      '<div class="stats"><div class="stat"><b>312</b>架空の&lt;件数&gt;</div>' +
        '<div class="stat"><b>0</b>架空の失敗</div></div>',
    )
  })

  it("コードと mermaid はフェンスで囲み、中のバッククォートより長いフェンスにする", () => {
    expect(
      markdownOf({
        kind: "code",
        language: "diff",
        path: "src/dummy.ts",
        source: "-a\n+b\n",
        fold: "",
      }),
    ).toBe("```diff src/dummy.ts\n-a\n+b\n```")
    expect(
      markdownOf({ kind: "code", language: "md", path: "", source: "```ts\nx\n```", fold: "" }),
    ).toBe("````md\n```ts\nx\n```\n````")
    expect(markdownOf({ kind: "mermaid", source: "flowchart LR\n  A --> B", fold: "" })).toBe(
      "```mermaid\nflowchart LR\n  A --> B\n```",
    )
  })

  it("fold のある塊は details に畳む", () => {
    expect(markdownOf({ kind: "text", text: "架空の脇道。", fold: "架空の<見出し>" })).toBe(
      "<details><summary>架空の&lt;見出し&gt;</summary>\n\n架空の脇道。\n\n</details>",
    )
  })

  describe("塊の文字の逃がし方", () => {
    it("inline code・太字・リンクはそのまま通す", () => {
      const inline = "**架空の太字** と `a < b` と [架空のリンク](https://example.com)"

      expect(markdownOf(text(inline))).toBe(inline)
    })

    it("改行を空白に畳み、inline code の外の < を逃がす", () => {
      expect(markdownOf(text("架空の一行目\n  架空の<b>二行目</b>"))).toBe(
        "架空の一行目 架空の&lt;b>二行目&lt;/b>",
      )
    })

    it.each([
      ["# 架空の見出し", "\\# 架空の見出し"],
      ["> 架空の引用", "\\> 架空の引用"],
      ["- 架空の項目", "\\- 架空の項目"],
      ["1. 架空の手順", "1\\. 架空の手順"],
      ["| 架空の列 |", "\\| 架空の列 |"],
      ["```ts", "\\```ts"],
      ["---", "\\---"],
    ])("行頭の塊の記法 %p は素の文字として出す", (source, expected) => {
      expect(markdownOf(text(source))).toBe(expected)
    })

    it("箇条書きの項目の行頭も逃がす", () => {
      expect(
        markdownOf({
          kind: "list",
          style: "bullet",
          items: [{ text: "## 架空", done: false }],
          fold: "",
        }),
      ).toBe("- \\## 架空")
    })
  })
})
