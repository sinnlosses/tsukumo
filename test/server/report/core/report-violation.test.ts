import { describe, expect, it } from "vitest"

import {
  type ReportDraft,
  reportRejectionText,
  reportViolations,
} from "../../../../src/server/report/core/report-violation.ts"
import {
  type ReportBlock,
  REPORT_MERMAID_KINDS,
  type ReportSection,
} from "../../../../src/shared/report/report-block.ts"

// レポートの文面はどれも作り物（docs/coding-standards.md「会話内容の扱い」）。

const draft = (
  blocks: readonly ReportBlock[],
  conclusion = "架空の結論。",
  sections: readonly ReportSection[] = [{ heading: "", blocks }],
): ReportDraft => ({
  conclusion,
  sections:
    blocks.length === 0 ? sections.filter((section) => section.blocks.length > 0) : sections,
  favor: "",
  checks: [],
})

const text = (value: string, fold = ""): ReportBlock => ({ kind: "text", text: value, fold })
const markdown = (value: string): ReportBlock => ({ kind: "markdown", markdown: value, fold: "" })
const mermaid = (source: string): ReportBlock => ({ kind: "mermaid", source, fold: "" })
const note = (): ReportBlock => ({ kind: "note", tone: "warn", text: "架空の一文。", fold: "" })

const kinds = (report: ReportDraft) => reportViolations(report).map((violation) => violation.kind)

describe("reportViolations", () => {
  it("規約どおりのレポートには違反が無い", () => {
    const blocks: readonly ReportBlock[] = [
      text("架空の段落の1文目。2文目。3文目。"),
      {
        kind: "table",
        title: "架空の表（作り物の値）",
        columns: ["列", "値"],
        rows: [["a", { status: "ok", text: "OK" }]],
        fold: "",
      },
      mermaid("flowchart LR\n  a --> b"),
      note(),
      markdown('<div class="cols"><div class="card">架空の案A</div></div>'),
    ]

    expect(reportViolations(draft(blocks, "架空の結論の1文目。2文目。"))).toEqual([])
  })

  describe("conclusion は2文まで", () => {
    it("3文あれば違反", () => {
      expect(reportViolations(draft([], "架空の1文目。2文目。3文目。"))).toEqual([
        { kind: "long-conclusion", count: 3 },
      ])
    })

    it("句点で終わらない末尾も1文と数える", () => {
      expect(kinds(draft([], "架空の1文目。2文目。3文目"))).toEqual(["long-conclusion"])
    })

    it("inline code と全角の丸括弧の中の句点では割らない", () => {
      expect(kinds(draft([], "架空の結論（補足。補足。）。`a。b。` を直した。"))).toEqual([])
    })
  })

  describe("地の文の段落は3文まで", () => {
    it("4文の text の塊は違反", () => {
      expect(reportViolations(draft([text("架空の1文目。2文目。3文目。4文目。")]))).toEqual([
        { kind: "long-paragraph", count: 1 },
      ])
    })

    it("fold で畳んだ text の塊は数えない（4文目の逃げ先なので）", () => {
      expect(kinds(draft([text("架空の1文目。2文目。3文目。4文目。", "架空の見出し")]))).toEqual([])
    })

    it("逃げ道の中の段落も数え、空行で割った段落はそれぞれで数える", () => {
      expect(kinds(draft([markdown("架空の1文目。2文目。3文目。4文目。")]))).toEqual([
        "long-paragraph",
      ])
      expect(kinds(draft([markdown("架空の1文目。2文目。\n\n3文目。4文目。")]))).toEqual([])
    })

    it("逃げ道の <details> の中の段落は数えない", () => {
      const body = [
        "<details><summary>架空の見出し</summary>",
        "",
        "架空の1文目。2文目。3文目。4文目。",
        "",
        "</details>",
      ].join("\n")
      expect(kinds(draft([markdown(body)]))).toEqual([])
    })
  })

  describe("表の行の長さは columns と揃える", () => {
    it("セルの数が揃わない行のある表は違反", () => {
      const table: ReportBlock = {
        kind: "table",
        title: "架空の表",
        columns: ["列", "値"],
        rows: [["a", "1"], ["b"]],
        fold: "",
      }
      expect(reportViolations(draft([table]))).toEqual([{ kind: "ragged-table", count: 1 }])
    })
  })

  describe("節が2つ以上なら全部に見出し", () => {
    it("見出しの無い節があれば違反", () => {
      const sections = [
        { heading: "架空の節", blocks: [text("架空の一。")] },
        { heading: " ", blocks: [text("架空の二。")] },
      ]
      expect(reportViolations(draft([], "架空の結論。", sections))).toEqual([
        { kind: "untitled-section", count: 1 },
      ])
    })

    it("節が1つなら見出しが無くてもよい", () => {
      expect(kinds(draft([text("架空の一。")]))).toEqual([])
    })
  })

  describe("mermaid は規約の10種だけ", () => {
    it("10種は違反にしない", () => {
      for (const kind of REPORT_MERMAID_KINDS) {
        expect(kinds(draft([mermaid(kind)]))).toEqual([])
      }
    })

    it("10種の外の種類は違反", () => {
      expect(reportViolations(draft([mermaid('pie\n  "a" : 1')]))).toEqual([
        { kind: "unknown-mermaid", count: 1 },
      ])
    })

    it("%% の行と先頭の --- の設定は飛ばして種類を読む", () => {
      const source = ["---", "title: 架空", "---", "%% 架空", "flowchart LR"].join("\n")
      expect(kinds(draft([mermaid(source)]))).toEqual([])
    })
  })

  describe("note の塊は1〜2個まで", () => {
    it("3つあれば違反", () => {
      expect(reportViolations(draft([note(), note(), note()]))).toEqual([
        { kind: "too-many-notes", count: 3 },
      ])
    })

    it("2つなら違反にしない", () => {
      expect(kinds(draft([note(), note()]))).toEqual([])
    })
  })

  describe("逃げ道に塊の種類がある記法を書かない", () => {
    const notationsOf = (body: string) =>
      reportViolations(draft([markdown(body)])).flatMap((violation) =>
        violation.kind === "markdown-notation" ? violation.notations : [],
      )

    it("見出し・表・箇条書き・note・stats・フェンス・mermaid はそれぞれ違反", () => {
      expect(notationsOf("# 架空")).toEqual(["heading"])
      expect(notationsOf("## 架空")).toEqual(["heading"])
      expect(notationsOf("| 列 | 値 |\n| --- | --- |\n| a | 1 |")).toEqual(["table"])
      expect(notationsOf("- 架空の1\n- 架空の2")).toEqual(["list"])
      expect(notationsOf("1. 架空の1")).toEqual(["list"])
      expect(notationsOf('<div class="note note-warn">架空の注意。</div>')).toEqual(["note"])
      expect(notationsOf('<div class="note note-favor">架空のお願い。</div>')).toEqual(["note"])
      expect(notationsOf('<div class="stats"><div class="stat"><b>1</b>架空</div></div>')).toEqual([
        "stats",
      ])
      expect(
        notationsOf('<div class="progress"><div class="progress-step"><b>1</b>架空</div></div>'),
      ).toEqual(["progress"])
      expect(notationsOf("```diff src/a.ts\n-a\n+b\n```")).toEqual(["code"])
      expect(notationsOf("```mermaid\nflowchart LR\n```")).toEqual(["mermaid"])
    })

    it("数は記法の種類の数で、種類はまとめて1つの違反にする", () => {
      expect(reportViolations(draft([markdown("# 架空\n\n- 架空の1\n- 架空の2")]))).toEqual([
        { kind: "markdown-notation", count: 2, notations: ["heading", "list"] },
      ])
    })

    it("塊の種類が無い記法・### の見出し・chart のフェンスは違反にしない", () => {
      const body = [
        '<div class="cols"><div class="card">架空の案A</div><div class="card">架空の案B</div></div>',
        "",
        "> 架空の引用",
        "",
        "---",
        "",
        "### 架空の小見出し",
        "",
        "```chart",
        "{}",
        "```",
      ].join("\n")
      expect(kinds(draft([markdown(body)]))).toEqual([])
    })

    it("HTML の塊の中（複数の塊を畳む <details>・cols のカード）は見ない", () => {
      const body = [
        "<details><summary>架空の見出し</summary>",
        "",
        "- 架空の1",
        "- 架空の2",
        "",
        "```diff src/a.ts",
        "-a",
        "```",
        "",
        "</details>",
      ].join("\n")
      expect(kinds(draft([markdown(body)]))).toEqual([])
    })

    it("フェンスの中の記法は見ない", () => {
      expect(notationsOf("```chart\n# 架空\n- 架空\n```")).toEqual([])
    })
  })
})

describe("reportRejectionText", () => {
  it("違反した条と直し方を1行ずつ並べ、レポートの文面は写さない", () => {
    const report = draft([markdown("# 架空の見出しXYZ")], "架空の1文目XYZ。2文目。3文目。")
    const rejection = reportRejectionText(reportViolations(report))

    expect(rejection.split("\n")).toHaveLength(3)
    expect(rejection).toContain("`conclusion` が3文ある")
    expect(rejection).toContain(
      "`markdown` の塊に塊で書ける記法（`#` / `##` の見出し）がある。代わりに節の `heading`を使う",
    )
    expect(rejection).not.toContain("XYZ")
  })

  it("画面の状態（描けたか・どこに出たか）を載せない", () => {
    const rejection = reportRejectionText(reportViolations(draft([markdown("# 架空")])))
    expect(rejection).not.toContain("画面")
    expect(rejection).not.toContain("メインビュー")
  })
})
