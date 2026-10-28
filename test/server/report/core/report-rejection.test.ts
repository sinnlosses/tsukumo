import { describe, expect, it } from "vitest"

import {
  REPORT_CHANGED_FIELDS_ONLY_TEXT,
  reportRejectionText,
} from "../../../../src/server/report/core/report-rejection.ts"
import { reportViolations } from "../../../../src/server/report/core/report-violation-check.ts"
import type { ReportDraft } from "../../../../src/server/report/core/report-violation.ts"
import type { ReportBlock, ReportSection } from "../../../../src/shared/report/report-block.ts"
import {
  code,
  draft,
  kinds,
  markdown,
  mermaid,
  reportDraftText,
} from "../../../fixture/report-draft-block.ts"

const REJECTION_HEADER = "レポートの記法の規約に次の違反がある。直して `report` を呼び直すこと:"
const MARKDOWN_NOTATION_LINE =
  "- `Markdown` に部品で書ける記法（`#` / `##` の見出し）がある。代わりに節の `heading`を使う"

function violationLines(rejection: string): readonly string[] {
  return rejection.split("\n").slice(1, -1)
}

describe("reportRejectionText", () => {
  it("違反した条と直し方を1行ずつ並べ、直す欄だけで呼び直せることを末尾に添え、レポートの文面は写さない", () => {
    const report = draft(
      [markdown("# 架空の見出しXYZ")],
      ["架空の1文目XYZ。", "2文目。", "3文目。"],
    )
    const rejection = reportRejectionText(reportViolations(report))

    expect(rejection).toBe(
      [
        REJECTION_HEADER,
        "- `conclusion` が3要素ある。1要素1文で2要素以内にし、残りは `Section` へ移す",
        MARKDOWN_NOTATION_LINE,
        REPORT_CHANGED_FIELDS_ONLY_TEXT,
      ].join("\n"),
    )
  })

  it("画面の状態（描けたか・どこに出たか）を載せない", () => {
    const rejection = reportRejectionText(reportViolations(draft([markdown("# 架空")])))
    expect(rejection).toBe(
      [REJECTION_HEADER, MARKDOWN_NOTATION_LINE, REPORT_CHANGED_FIELDS_ONLY_TEXT].join("\n"),
    )
  })

  it("code-mismatch は食い違った path を載せる", () => {
    const report: ReportDraft = {
      ...draft([code("src/fixture-f.ts", "架空の行")]),
      fileContents: new Map([["src/fixture-f.ts", "架空の別の行"]]),
    }
    const rejection = reportRejectionText(reportViolations(report))
    expect(violationLines(rejection)).toEqual([
      "- `path` 付きの `Code` が1個、ファイルの中身と一致しない（src/fixture-f.ts）。実物を読み直して直すか `path` を外す",
    ])
  })

  describe("broken-svg", () => {
    const svg = (
      shapes: Extract<ReportBlock, { kind: "svg" }>["shapes"],
      legend: Extract<ReportBlock, { kind: "svg" }>["legend"] = [],
    ): ReportBlock => ({
      kind: "svg",
      title: "",
      width: 100,
      height: 50,
      shapes,
      legend,
      fold: "",
      aside: "",
    })
    const rect = (x: number, y: number, width: number, height: number) =>
      ({
        kind: "rect",
        x,
        y,
        width,
        height,
        label: "",
        sub: "",
        emphasis: false,
        labelAt: "center",
        tone: "none",
      }) as const

    it("枠内に収まる図形は違反にならない（端に接するのは収まり）", () => {
      expect(kinds(draft([svg([rect(0, 0, 100, 50)])]))).toEqual([])
    })

    it("はみ出した図形を、何個目の塊の何番目の図形かだけで言う", () => {
      const report = draft([
        svg([rect(0, 0, 10, 10)]),
        svg([
          { kind: "text", x: 5, y: 5, text: "架空の秘密" },
          rect(90, 0, 20, 10),
          {
            kind: "line",
            x1: 0,
            y1: 0,
            x2: 10,
            y2: -1,
            arrow: false,
            label: "",
            dashed: false,
            tone: "none",
          },
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
      expect(violationLines(rejection)).toEqual([
        "- `Svg` の図形が `width` × `height` の外に出ている（2個目の 2 番目、2個目の 3 番目）。幅の目安は 480〜640 で、図形の座標と大きさを 0〜`width`・0〜`height` の内側に収める",
      ])
    })

    it("timeline の誤りの文面は、describe から外した時刻の揃え方と並びの決まりを書き手に返す", () => {
      const text = reportRejectionText([{ kind: "broken-timeline", count: 1, faults: [] }])
      for (const rule of [
        "HH:MM",
        "日をまたぐなら ISO",
        "lane",
        "start の昇順",
        "extra",
        "at の昇順",
        "emphasis",
      ]) {
        expect(text).toContain(rule)
      }
    })

    it("legend に無い tone を、何個目の塊のどの tone かだけで言い、legend にあれば通す", () => {
      const toned = (
        tone: "a" | "b",
        legend: Extract<ReportBlock, { kind: "svg" }>["legend"],
      ): ReportBlock => svg([{ ...rect(0, 0, 10, 10), label: "架空の秘密", tone }], legend)
      const report = draft([toned("a", [{ tone: "a", label: "層" }]), toned("b", [])])
      expect(reportViolations(report)).toEqual([
        { kind: "unlegended-svg-tone", count: 1, faults: [{ block: 2, tone: "b" }] },
      ])
      const rejection = reportRejectionText(reportViolations(report))
      expect(violationLines(rejection)).toEqual([
        "- `Svg` の `rect` の `tone` が `legend` に無い（2個目の b）。`legend` に `tone` と名前を足す（色だけで意味を言わない）",
      ])
      expect(kinds(draft([toned("a", [{ tone: "a", label: "層" }])]))).toEqual([])
    })

    it("graph の色の目印も legend に無ければ、何個目の塊のどの tone かだけで言って差し戻す", () => {
      const graph = (
        source: string,
        legend: Extract<ReportBlock, { kind: "graph" }>["legend"],
      ): ReportBlock => ({
        kind: "graph",
        title: "",
        direction: "TD",
        legend,
        source,
        fold: "",
        aside: "",
      })
      const report = draft([
        graph("[架空の秘密] @a\nA\n[]\nA -> B @b", [{ tone: "a", label: "層" }]),
        graph("C -> D @c", [{ tone: "c", label: "線" }]),
      ])

      expect(reportViolations(report)).toEqual([
        { kind: "unlegended-graph-tone", count: 1, faults: [{ block: 1, tone: "b" }] },
      ])
      const rejection = reportRejectionText(reportViolations(report))
      expect(violationLines(rejection)).toEqual([
        "- `Graph` の ` @a`〜` @e` の色の目印が `legend` に無い（1個目の b）。`legend` に `tone` と名前を足す（色だけで意味を言わない）",
      ])
      expect(kinds(draft([graph("C -> D @c", [{ tone: "c", label: "線" }])]))).toEqual([])
    })

    it("line の tone も legend に無ければ差し戻す", () => {
      const line = {
        kind: "line",
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 0,
        arrow: false,
        label: "",
        dashed: false,
        tone: "c",
      } as const
      expect(reportViolations(draft([svg([line])]))).toEqual([
        { kind: "unlegended-svg-tone", count: 1, faults: [{ block: 1, tone: "c" }] },
      ])
      expect(kinds(draft([svg([line], [{ tone: "c", label: "層" }])]))).toEqual([])
    })

    it("beforeAfter の svg の側も数える", () => {
      const side = {
        kind: "svg",
        width: 10,
        height: 10,
        shapes: [{ kind: "text", x: 11, y: 0, text: "架空" }],
        legend: [],
      } as const
      const report = draft([
        { kind: "beforeAfter", title: "", before: side, after: side, fold: "", aside: "" },
      ])
      expect(kinds(report)).toEqual(["broken-svg"])
    })
  })

  describe("figure の図も図の塊の検査にかける", () => {
    it("figure の graph の読めない行は、描く順の1個目として違反になる", () => {
      const report: ReportDraft = {
        ...draft([
          {
            kind: "graph",
            title: "",
            direction: "TD",
            legend: [],
            source: "A -> B",
            fold: "",
            aside: "",
          },
        ]),
        figure: {
          kind: "graph",
          title: "",
          direction: "TD",
          legend: [],
          source: "A ->",
          fold: "",
          aside: "",
        },
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
          legend: [],
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
      items: [
        {
          label: "",
          text: "架空の秘密の段",
          done: false,
          source: "",
          branch: "",
          branchTone: "warn",
        },
      ],
      fold: "",
      aside: "",
    }

    it("no-shape なのに sections に流れ・つながりの塊があれば、その塊の数で違反になり、文面に本文を写さない", () => {
      const violations = reportViolations(
        withReason("no-shape", [
          {
            heading: "",
            shapeTag: "unspecified",
            blocks: [
              flow,
              mermaid("sequenceDiagram\n  a ->> b: x"),
              reportDraftText("架空の秘密の根拠。"),
            ],
          },
        ]),
      )
      expect(violations).toEqual([{ kind: "figure-contradiction", count: 2, reason: "no-shape" }])
      const rejection = reportRejectionText(violations)
      expect(violationLines(rejection)).toEqual([
        "- `figure` の reason が `no-shape` なのに、`Section` に流れ・つながり・構造を描く部品（`ItemList` の `flow`・`BeforeAfter`・`Graph`・`Mermaid`・`Svg`）が2個ある。その図を `figure` に置くか、合う reason にする",
      ])
    })

    it("no-shape で bullet の箇条や表しか無ければ違反にしない", () => {
      const bullet: ReportBlock = { ...flow, style: "bullet" }
      expect(
        kinds(withReason("no-shape", [{ heading: "", shapeTag: "unspecified", blocks: [bullet] }])),
      ).toEqual([])
    })

    it("short-answer なのに節が2つ以上あれば違反になる", () => {
      const twoSections = withReason("short-answer", [
        {
          heading: "架空の節1",
          shapeTag: "unspecified",
          blocks: [reportDraftText("架空の根拠。")],
        },
        {
          heading: "架空の節2",
          shapeTag: "unspecified",
          blocks: [reportDraftText("架空の根拠。")],
        },
      ])
      expect(reportViolations(twoSections)).toEqual([
        { kind: "figure-contradiction", count: 2, reason: "short-answer" },
      ])
      expect(violationLines(reportRejectionText(reportViolations(twoSections)))).toEqual([
        "- `figure` の reason が `short-answer` なのに、節が2つ以上ある。2〜3文で終わる答えでなければ `figure` に図を置くか、合う reason にする",
      ])
    })

    it("short-answer で節1つなら、4文以上の地の文でも違反にしない", () => {
      expect(
        kinds(
          withReason("short-answer", [
            {
              heading: "",
              shapeTag: "unspecified",
              blocks: [reportDraftText("架空の1文目。2文目。3文目。4文目。")],
            },
          ]),
        ),
      ).toEqual([])
    })

    it("ほかの理由・記録の無い理由・図を置いた回は見ない", () => {
      const sections: readonly ReportSection[] = [
        { heading: "架空の節1", shapeTag: "unspecified", blocks: [flow] },
        { heading: "架空の節2", shapeTag: "unspecified", blocks: [flow] },
      ]
      for (const figure of [
        { kind: "none", reason: "single-value" },
        { kind: "none", reason: "no-material" },
        { kind: "none", reason: "unrecorded" },
        {
          kind: "graph",
          title: "",
          direction: "TD",
          legend: [],
          source: "A -> B",
          fold: "",
          aside: "",
        },
      ] as const) {
        expect(kinds({ ...draft([], "架空の結論。", sections), figure })).toEqual([])
      }
    })
  })
})
