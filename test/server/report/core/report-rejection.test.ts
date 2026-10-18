import { describe, expect, it } from "vitest"

import { reportRejectionText } from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import { code, draft, kinds, markdown, mermaid, text } from "../../../fixture/report-draft-block.ts"

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

  it("code-mismatch は食い違った path を載せる", () => {
    const report: ReportDraft = {
      ...draft([code("src/fixture-f.ts", "架空の行")]),
      fileContents: new Map(),
    }
    const rejection = reportRejectionText(reportViolations(report))
    expect(rejection).toContain("src/fixture-f.ts")
  })

  describe("broken-svg", () => {
    const svg = (shapes: Extract<ReportBlock, { kind: "svg" }>["shapes"]): ReportBlock => ({
      kind: "svg",
      title: "",
      width: 100,
      height: 50,
      shapes,
      fold: "",
      aside: "",
    })
    const rect = (x: number, y: number, width: number, height: number) =>
      ({ kind: "rect", x, y, width, height, label: "", emphasis: false }) as const

    it("枠内に収まる図形は違反にならない（端に接するのは収まり）", () => {
      expect(kinds(draft([svg([rect(0, 0, 100, 50)])]))).not.toContain("broken-svg")
    })

    it("はみ出した図形を、何個目の塊の何番目の図形かだけで言う", () => {
      const report = draft([
        svg([rect(0, 0, 10, 10)]),
        svg([
          { kind: "text", x: 5, y: 5, text: "架空の秘密" },
          rect(90, 0, 20, 10),
          { kind: "line", x1: 0, y1: 0, x2: 10, y2: -1, arrow: false, label: "" },
        ]),
      ])
      expect(reportViolations(report)).toEqual([
        {
          kind: "broken-svg",
          count: 2,
          faults: [
            { block: 2, shape: 2 },
            { block: 2, shape: 3 },
          ],
        },
      ])
      const rejection = reportRejectionText(reportViolations(report))
      expect(rejection).toContain("2個目の 2 番目、2個目の 3 番目")
      expect(rejection).not.toContain("架空の秘密")
    })

    it("beforeAfter の svg の側も数える", () => {
      const side = {
        kind: "svg",
        width: 10,
        height: 10,
        shapes: [{ kind: "text", x: 11, y: 0, text: "架空" }],
      } as const
      const report = draft([
        { kind: "beforeAfter", title: "", before: side, after: side, fold: "", aside: "" },
      ])
      expect(kinds(report)).toContain("broken-svg")
    })
  })

  describe("broken-mermaid", () => {
    const withFaults = (mermaidFaults: ReportDraft["mermaidFaults"]): ReportDraft => ({
      ...draft([mermaid("sequenceDiagram\n  A->>B: 架空の秘密; there")]),
      mermaidFaults,
    })

    it("割れた図があると違反になり、文面は位置と字句の名前だけを持ちソースを含まない", () => {
      const fault = { kind: "located", block: 2, line: 3, token: "NEWLINE" } as const
      const report = withFaults([fault])
      expect(reportViolations(report)).toEqual([
        { kind: "broken-mermaid", count: 1, faults: [fault] },
      ])
      const rejection = reportRejectionText(reportViolations(report))
      expect(rejection).toContain("2個目の 3 行目・字句 NEWLINE")
      expect(rejection).not.toContain("架空の秘密")
    })

    it("行が取れない図は行を出さず、何個目かだけを言う", () => {
      const rejection = reportRejectionText(
        reportViolations(withFaults([{ kind: "unlocated", block: 1 }])),
      )
      expect(rejection).toContain("（1個目）")
      expect(rejection).not.toContain("行目")
    })

    it("割れた図が無い（検査できなかったときも同じ）なら違反にならない", () => {
      expect(reportViolations(withFaults([]))).toEqual([])
    })
  })

  describe("figure の図も図の塊の検査にかける", () => {
    it("figure の graph の読めない行は、描く順の1個目として違反になる", () => {
      const report: ReportDraft = {
        ...draft([
          { kind: "graph", title: "", direction: "TD", source: "A -> B", fold: "", aside: "" },
        ]),
        figure: { kind: "graph", title: "", direction: "TD", source: "A ->", fold: "", aside: "" },
      }
      expect(reportViolations(report)).toEqual([
        { kind: "broken-graph", count: 1, faults: [{ block: 1, line: 1 }] },
      ])
    })

    it("figure の svg のはみ出しと mermaid の種類も見る", () => {
      const report: ReportDraft = {
        ...draft([]),
        figure: {
          kind: "svg",
          title: "",
          width: 10,
          height: 10,
          shapes: [{ kind: "text", x: 11, y: 0, text: "架空" }],
          fold: "",
          aside: "",
        },
      }
      expect(kinds(report)).toEqual(["broken-svg"])
      expect(
        kinds({
          ...draft([]),
          figure: { kind: "mermaid", title: "", source: "flowchart TD", fold: "", aside: "" },
        }),
      ).toEqual(["unknown-mermaid"])
    })
  })

  describe("figure-contradiction", () => {
    const withReason = (
      reason: "no-shape" | "short-answer",
      sections: readonly ReportSection[],
    ): ReportDraft => ({
      ...draft([], "架空の結論。", sections),
      figure: { kind: "none", reason },
    })
    const flow: ReportBlock = {
      kind: "list",
      style: "flow",
      items: [{ label: "", text: "架空の秘密の段", done: false }],
      fold: "",
      aside: "",
    }

    it("no-shape なのに sections に流れ・つながりの塊があれば、その塊の数で違反になり、文面に本文を写さない", () => {
      const violations = reportViolations(
        withReason("no-shape", [
          {
            heading: "",
            blocks: [flow, mermaid("sequenceDiagram\n  a ->> b: x"), text("架空の秘密の根拠。")],
          },
        ]),
      )
      expect(violations).toEqual([{ kind: "figure-contradiction", count: 2, reason: "no-shape" }])
      const rejection = reportRejectionText(violations)
      expect(rejection).toContain("`no-shape`")
      expect(rejection).not.toContain("架空の秘密")
    })

    it("no-shape で bullet の箇条や表しか無ければ違反にしない", () => {
      const bullet: ReportBlock = { ...flow, style: "bullet" }
      expect(kinds(withReason("no-shape", [{ heading: "", blocks: [bullet] }]))).toEqual([])
    })

    it("short-answer なのに節が2つ以上か、畳んだものも含め4文以上の地の文があれば違反になる", () => {
      const twoSections = withReason("short-answer", [
        { heading: "架空の節1", blocks: [text("架空の根拠。")] },
        { heading: "架空の節2", blocks: [text("架空の根拠。")] },
      ])
      const longFolded = withReason("short-answer", [
        { heading: "", blocks: [text("架空の1文目。2文目。3文目。4文目。", "架空の畳み")] },
      ])
      expect(reportViolations(twoSections)).toEqual([
        { kind: "figure-contradiction", count: 2, reason: "short-answer" },
      ])
      expect(reportViolations(longFolded)).toEqual([
        { kind: "figure-contradiction", count: 1, reason: "short-answer" },
      ])
      expect(reportRejectionText(reportViolations(longFolded))).not.toContain("架空の1文目")
    })

    it("short-answer で節1つ・3文までの地の文なら違反にしない", () => {
      expect(
        kinds(
          withReason("short-answer", [
            { heading: "", blocks: [text("架空の1文目。2文目。3文目。")] },
          ]),
        ),
      ).toEqual([])
    })

    it("ほかの理由・記録の無い理由・図を置いた回は見ない", () => {
      const sections = [
        { heading: "架空の節1", blocks: [flow] },
        { heading: "架空の節2", blocks: [flow] },
      ]
      for (const figure of [
        { kind: "none", reason: "single-value" },
        { kind: "none", reason: "no-material" },
        { kind: "none", reason: "unrecorded" },
        { kind: "graph", title: "", direction: "TD", source: "A -> B", fold: "", aside: "" },
      ] as const) {
        expect(kinds({ ...draft([], "架空の結論。", sections), figure })).toEqual([])
      }
    })
  })
})
