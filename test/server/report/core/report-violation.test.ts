import { describe, expect, it } from "bun:test"

import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import {
  type ReportDraft,
  reportRejectionText,
  reportViolations,
} from "../../../../src/server/report/core/report-violation.ts"

// レポートの文面はどれも作り物（docs/coding-standards.md「会話内容の扱い」）。

const draft = (body: string, conclusion = "架空の結論。"): ReportDraft => ({
  conclusion,
  body,
  favor: "",
  checks: [],
})

const kinds = (report: ReportDraft) => reportViolations(report).map((violation) => violation.kind)

/** 規約が挙げる mermaid の10種（`report-notation.ts` の表の2行）。 */
const MERMAID_KINDS = [
  "flowchart",
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
  "erDiagram",
  "mindmap",
  "timeline",
  "gantt",
  "gitGraph",
  "quadrantChart",
] as const

describe("reportViolations", () => {
  it("規約どおりのレポートには違反が無い", () => {
    const body = [
      "## 架空の見出し",
      "",
      "架空の段落の1文目。2文目。3文目。",
      "",
      "**架空の表（作り物の値）**",
      "",
      "| 列 | 値 |",
      "| --- | ---: |",
      "| a | 1 |",
      "",
      "```mermaid",
      "flowchart LR",
      "  a --> b",
      "```",
      "",
      '<div class="note note-warn">架空の注意。</div>',
    ].join("\n")

    expect(reportViolations(draft(body, "架空の結論の1文目。2文目。"))).toEqual([])
  })

  describe("conclusion は2文まで", () => {
    it("3文あれば違反", () => {
      expect(reportViolations(draft("", "架空の1文目。2文目。3文目。"))).toEqual([
        { kind: "long-conclusion", count: 3 },
      ])
    })

    it("句点で終わらない末尾も1文と数える", () => {
      expect(kinds(draft("", "架空の1文目。2文目。3文目"))).toEqual(["long-conclusion"])
    })

    it("inline code と全角の丸括弧の中の句点では割らない", () => {
      expect(kinds(draft("", "架空の結論（補足。補足。）。`a。b。` を直した。"))).toEqual([])
    })
  })

  describe("地の文の段落は3文まで", () => {
    it("4文の段落は違反", () => {
      expect(reportViolations(draft("架空の1文目。2文目。3文目。4文目。"))).toEqual([
        { kind: "long-paragraph", count: 1 },
      ])
    })

    it("空行で割った段落はそれぞれで数える", () => {
      expect(kinds(draft("架空の1文目。2文目。\n\n3文目。4文目。"))).toEqual([])
    })

    it("箇条書き・表・引用の行は地の文に数えない", () => {
      const body = ["- 架空の1。", "- 架空の2。", "- 架空の3。", "- 架空の4。"].join("\n")
      expect(kinds(draft(body))).toEqual([])
    })

    it("<details> の中の段落は数えない（4文目の逃げ先なので）", () => {
      const body = [
        "<details><summary>架空の見出し</summary>",
        "",
        "架空の1文目。2文目。3文目。4文目。",
        "",
        "</details>",
      ].join("\n")
      expect(kinds(draft(body))).toEqual([])
    })

    it("フェンスの中は数えない", () => {
      expect(kinds(draft("```text\n架空の1。2。3。4。\n```"))).toEqual([])
    })
  })

  describe("# の見出しを使わない", () => {
    it("# の見出しは違反", () => {
      expect(kinds(draft("# 架空の見出し"))).toEqual(["top-heading"])
    })

    it("## / ### は違反にしない", () => {
      expect(kinds(draft("## 架空の見出し\n\n### 架空の小見出し"))).toEqual([])
    })

    it("フェンスの中の # は見出しにしない", () => {
      expect(kinds(draft("```sh\n# 架空のコメント\n```"))).toEqual([])
    })
  })

  describe("表の直前に太字1行の見出し", () => {
    it("見出しの無い表は違反", () => {
      expect(reportViolations(draft("| 列 | 値 |\n| --- | --- |\n| a | 1 |"))).toEqual([
        { kind: "untitled-table", count: 1 },
      ])
    })

    it("直前の行が地の文なら違反", () => {
      expect(kinds(draft("架空の説明。\n\n| 列 | 値 |\n| :---: | --- |\n| a | 1 |"))).toEqual([
        "untitled-table",
      ])
    })

    it("太字1行の見出しがあれば違反にしない（間に空行があってもよい）", () => {
      expect(kinds(draft("**架空の表**\n\n| 列 | 値 |\n| --- | --- |\n| a | 1 |"))).toEqual([])
    })
  })

  describe("mermaid は規約の10種だけ", () => {
    it("10種はどれも規約の文面に載っていて、違反にしない", () => {
      for (const kind of MERMAID_KINDS) {
        expect(REPORT_NOTATION_PROMPT).toContain(`${kind} は`)
        expect(kinds(draft(`\`\`\`mermaid\n${kind}\n\`\`\``))).toEqual([])
      }
    })

    it("10種の外の種類は違反", () => {
      expect(reportViolations(draft('```mermaid\npie\n  "a" : 1\n```'))).toEqual([
        { kind: "unknown-mermaid", count: 1 },
      ])
    })

    it("%% の行と先頭の --- の設定は飛ばして種類を読む", () => {
      const body = ["```mermaid", "---", "title: 架空", "---", "%% 架空", "flowchart LR", "```"]
      expect(kinds(draft(body.join("\n")))).toEqual([])
    })
  })

  describe("note の塊はお願いを除いて1〜2個まで", () => {
    const note = (kind: string) => `<div class="note ${kind}">架空の一文。</div>`

    it("3つあれば違反", () => {
      const body = [note("note-warn"), note("note-memo"), note("note-ask")].join("\n\n")
      expect(reportViolations(draft(body))).toEqual([{ kind: "too-many-notes", count: 3 }])
    })

    it("2つなら違反にしない", () => {
      expect(kinds(draft([note("note-warn"), note("note-memo")].join("\n\n")))).toEqual([])
    })
  })

  describe("お願いを body に書かない", () => {
    it("body の note-favor は違反", () => {
      expect(kinds(draft('<div class="note note-favor">架空のお願い。</div>'))).toEqual([
        "favor-in-body",
      ])
    })

    it("favor に書いたお願いは違反にしない", () => {
      expect(
        reportViolations({
          conclusion: "架空の結論。",
          body: "",
          favor: "架空のお願い。",
          checks: [],
        }),
      ).toEqual([])
    })
  })
})

describe("reportRejectionText", () => {
  it("違反した条と直し方を1行ずつ並べ、レポートの文面は写さない", () => {
    const report = draft("# 架空の見出しXYZ", "架空の1文目XYZ。2文目。3文目。")
    const text = reportRejectionText(reportViolations(report))

    expect(text.split("\n")).toHaveLength(3)
    expect(text).toContain("`conclusion` が3文ある")
    expect(text).toContain("`#` の見出しがある")
    expect(text).not.toContain("XYZ")
  })

  it("画面の状態（描けたか・どこに出たか）を載せない", () => {
    const text = reportRejectionText(reportViolations(draft("# 架空")))
    expect(text).not.toContain("画面")
    expect(text).not.toContain("メインビュー")
  })
})
