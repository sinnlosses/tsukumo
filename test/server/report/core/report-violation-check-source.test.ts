import { describe, expect, it } from "vitest"

import { mermaidSourcesInSections } from "../../../../src/server/report/core/report-figure-fault.ts"
import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import { REPORT_MERMAID_KINDS } from "../../../../src/shared/report/report-block-diagram.ts"
import type { ReportBlock } from "../../../../src/shared/report/report-block.ts"
import { code, draft, kinds, markdown, mermaid, note } from "../../../fixture/report-draft-block.ts"

type Side = Extract<ReportBlock, { readonly kind: "beforeAfter" }>["before"]

describe("reportViolations", () => {
  describe("mermaid は規約の9種だけ", () => {
    it("9種は違反にしない", () => {
      for (const kind of REPORT_MERMAID_KINDS) {
        expect(kinds(draft([mermaid(kind)]))).toEqual([])
      }
    })

    it("9種の外の種類は違反", () => {
      expect(reportViolations(draft([mermaid('pie\n  "a" : 1')]))).toEqual([
        { kind: "unknown-mermaid", count: 1 },
      ])
    })

    it("flowchart は旧い graph の書き出しも含めて違反にし、graph の塊は違反にしない", () => {
      expect(
        reportViolations(
          draft([mermaid("flowchart LR\n  a --> b"), mermaid("graph TD\n  a --> b")]),
        ),
      ).toEqual([{ kind: "unknown-mermaid", count: 2 }])
      const graph: ReportBlock = {
        kind: "graph",
        title: "",
        direction: "TD",
        source: "架空",
        fold: "",
        aside: "",
      }
      expect(kinds(draft([graph]))).toEqual([])
    })

    it("beforeAfter の mermaid の側も数える", () => {
      const side = (source: string): Side => ({ kind: "mermaid", source })
      const beforeAfter = (before: Side, after: Side): ReportBlock => ({
        kind: "beforeAfter",
        title: "",
        before,
        after,
        fold: "",
        aside: "",
      })
      expect(kinds(draft([beforeAfter(side("sequenceDiagram"), side("stateDiagram-v2"))]))).toEqual(
        [],
      )
      expect(
        reportViolations(
          draft([beforeAfter(side("flowchart LR\n  a --> b"), side("sequenceDiagram"))]),
        ),
      ).toEqual([{ kind: "unknown-mermaid", count: 1 }])
    })

    it("graph の囲みの入れ子は broken-graph にし、文面に囲みの書き方を添える", () => {
      const violations = reportViolations(
        draft([
          {
            kind: "graph",
            title: "",
            direction: "TD",
            source: "[甲]\n[乙]\nA\n[]",
            fold: "",
            aside: "",
          },
        ]),
      )

      expect(violations).toEqual([
        { kind: "broken-graph", count: 1, faults: [{ block: 1, line: 2 }] },
      ])
      expect(reportRejectionText(violations)).toContain("[群の名]")
    })

    it("graph の source に読めない行があれば broken-graph にし、位置だけで書き手の行は持たない", () => {
      const graph = (source: string): ReportBlock => ({
        kind: "graph",
        title: "",
        direction: "TD",
        source,
        fold: "",
        aside: "",
      })
      const violations = reportViolations(
        draft([
          graph("A -> B: 語"),
          graph("A -> B\n\nA - B"),
          graph("秘密の一行 - 秘密の二行"),
          graph("+ A\n- A"),
        ]),
      )
      expect(violations).toEqual([
        {
          kind: "broken-graph",
          count: 3,
          faults: [
            { block: 2, line: 3 },
            { block: 3, line: 1 },
            { block: 4, line: 2 },
          ],
        },
      ])
      const text = reportRejectionText(violations)
      expect(text).toContain("2個目の 3 行目、3個目の 1 行目、4個目の 2 行目")
      expect(text).toContain("A -> B: 語")
      expect(text).not.toContain("秘密")
    })

    it("検査に渡すソースは、単独の塊と側を出現順（前が先）に集める", () => {
      const side = (source: string): Side => ({ kind: "mermaid", source })
      const pair: ReportBlock = {
        kind: "beforeAfter",
        title: "",
        before: side("B"),
        after: { kind: "points", points: ["架空"] },
        fold: "",
        aside: "",
      }
      const both: ReportBlock = { ...pair, before: side("C"), after: side("D") }
      expect(
        mermaidSourcesInSections([{ heading: "", blocks: [mermaid("A"), pair, both] }]),
      ).toEqual(["A", "B", "C", "D"])
    })

    it("%% の行と先頭の --- の設定は飛ばして種類を読む", () => {
      const source = ["---", "title: 架空", "---", "%% 架空", "sequenceDiagram"].join("\n")
      expect(kinds(draft([mermaid(source)]))).toEqual([])
    })
  })

  describe("逃げ道に塊の種類がある記法を書かない", () => {
    const notationsOf = (body: string) =>
      reportViolations(draft([markdown(body)])).flatMap((violation) =>
        violation.kind === "markdown-notation" ? violation.notations : [],
      )

    it("画像（![]() と <img>）は image の塊へ差し戻す", () => {
      expect(notationsOf("![架空の画面](https://example.invalid/a.png)")).toEqual(["image"])
      expect(notationsOf('<img src="/tmp/a.png" alt="架空">')).toEqual(["image"])
      expect(notationsOf("```markdown\n![架空](a.png)\n```")).toEqual(["code"])
    })

    it("見出し・表・箇条書き・note・stats・フェンス・mermaid・chart はそれぞれ違反", () => {
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
      expect(notationsOf("```chart\n{}\n```")).toEqual(["chart"])
    })

    it("数は記法の種類の数で、種類はまとめて1つの違反にする", () => {
      expect(reportViolations(draft([markdown("# 架空\n\n- 架空の1\n- 架空の2")]))).toEqual([
        { kind: "markdown-notation", count: 2, notations: ["heading", "list"] },
      ])
    })

    it("塊の種類が無い記法・### の見出しは違反にしない", () => {
      const body = [
        '<div class="cols"><div class="card">架空の案A</div><div class="card">架空の案B</div></div>',
        "",
        "> 架空の引用",
        "",
        "---",
        "",
        "### 架空の小見出し",
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
      expect(notationsOf("```text\n# 架空\n- 架空\n```")).toEqual(["code"])
    })
  })

  describe("path 付きの code の塊はファイルと照合する", () => {
    const withFile = (
      blocks: readonly ReportBlock[],
      fileContents: ReadonlyMap<string, string>,
    ): ReportDraft => ({ ...draft(blocks), fileContents })

    it("中身がファイルの連続した一部と一致すれば違反にしない", () => {
      const report = withFile(
        [code("src/fixture-a.ts", "架空の1行目\n架空の2行目")],
        new Map([["src/fixture-a.ts", "先頭\n架空の1行目\n架空の2行目\n末尾"]]),
      )
      expect(kinds(report)).toEqual([])
    })

    it("1行でもファイルと違えば違反", () => {
      const report = withFile(
        [code("src/fixture-b.ts", "架空の1行目\n架空の2行目・改変")],
        new Map([["src/fixture-b.ts", "架空の1行目\n架空の2行目"]]),
      )
      expect(kinds(report)).toEqual(["code-mismatch"])
    })

    it("読めなかったファイル（fileContents に無い path）は違反", () => {
      const report = withFile([code("src/fixture-not-found.ts", "架空の行")], new Map())
      expect(kinds(report)).toEqual(["code-mismatch"])
    })

    it("path が空文字なら照合しない", () => {
      const report = withFile(
        [code("", "架空の案の行")],
        new Map([["src/fixture-a.ts", "無関係な中身"]]),
      )
      expect(kinds(report)).toEqual([])
    })

    describe("marks の行の範囲", () => {
      const SOURCE = "架空の1行目\n架空の2行目\n架空の3行目\n"
      const marked = (lines: string, path = ""): ReportBlock => ({
        kind: "code",
        language: "text",
        path,
        source: SOURCE,
        marks: [{ lines, label: "架空の印" }],
        fold: "",
        aside: "",
      })

      it.each(["1", "2-3", " 3 "])("行数以内の %s は通す", (lines) => {
        expect(kinds(withFile([marked(lines)], new Map()))).toEqual([])
      })

      it.each(["4", "2-4", "0", "3-2", "二行目", ""])("%s は差し戻す", (lines) => {
        expect(kinds(withFile([marked(lines)], new Map()))).toEqual(["code-marks-range"])
      })

      it("path 付きの塊に marks を足しても code-mismatch は増えない", () => {
        const files = new Map([["src/fixture-m.ts", SOURCE]])
        expect(kinds(withFile([marked("1-2", "src/fixture-m.ts")], files))).toEqual([])
      })

      it("文面は行数の外か読めない形だと言う", () => {
        const rejection = reportRejectionText(reportViolations(withFile([marked("9")], new Map())))
        expect(rejection).toContain("marks")
      })
    })

    it("他の規約違反と同じ report にあれば、1回の差し戻しで両方返る", () => {
      const report = withFile(
        [note(), note(), note(), code("src/fixture-e.ts", "架空の行")],
        new Map(),
      )
      expect(kinds(report)).toEqual(["too-many-notes", "code-mismatch"])
    })
  })
})
