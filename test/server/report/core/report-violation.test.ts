import { describe, expect, it } from "vitest"

import { mermaidSourcesInSections } from "../../../../src/server/report/core/report-figure-fault.ts"
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
import { MAX_CANDIDATES } from "../../../../src/shared/report/report-limit.ts"
import { reportDraft } from "../../../fixture/report-event.ts"

const draft = (
  blocks: readonly ReportBlock[],
  conclusion = "架空の結論。",
  sections: readonly ReportSection[] = [{ heading: "", blocks }],
): ReportDraft =>
  reportDraft({
    conclusion,
    sections:
      blocks.length === 0 ? sections.filter((section) => section.blocks.length > 0) : sections,
  })

type Side = Extract<ReportBlock, { readonly kind: "beforeAfter" }>["before"]

const text = (value: string, fold = ""): ReportBlock => ({ kind: "text", text: value, fold })
const markdown = (value: string): ReportBlock => ({ kind: "markdown", markdown: value, fold: "" })
const mermaid = (source: string): ReportBlock => ({ kind: "mermaid", title: "", source, fold: "" })
const note = (): ReportBlock => ({ kind: "note", tone: "warn", text: "架空の一文。", fold: "" })
const code = (path: string, source: string, language = "text"): ReportBlock => ({
  kind: "code",
  language,
  path,
  source,
  fold: "",
})

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
        rest: "",
        fold: "",
      },
      mermaid("sequenceDiagram\n  a ->> b: x"),
      note(),
      markdown('<div class="cols"><div class="card">架空の案A</div></div>'),
    ]

    expect(reportViolations(draft(blocks, "架空の結論の1文目。2文目。"))).toEqual([])
  })

  describe("結論の1文目・見出し・checks の分数", () => {
    const check = (figure: string) => ({
      status: "ok" as const,
      label: "架空の確認",
      figure,
      command: "",
      detail: "",
      howToVerify: "",
    })
    const withHeading = (heading: string): ReportDraft =>
      draft([], "架空の結論。", [{ heading, blocks: [text("架空の本文。")] }])

    it("1文目が全角50字なら通り、51字なら差し戻す", () => {
      expect(kinds(draft([text("架空。")], `${"あ".repeat(50)}。`))).toEqual([])
      expect(kinds(draft([text("架空。")], `${"あ".repeat(51)}。`))).toEqual([
        "long-first-sentence",
      ])
    })

    it.each([
      [51, "。"],
      [63, "！"],
    ])("1文目が%i字の差し戻しは、実測の字数を値と文面に持つ", (length, end) => {
      const violations = reportViolations(draft([text("架空。")], `${"あ".repeat(length)}${end}`))
      expect(violations).toEqual([{ kind: "long-first-sentence", count: 1, length }])
      expect(reportRejectionText(violations)).toContain(`いま${String(length)}字`)
    })

    it("2文目が長くても1文目が短ければ通る", () => {
      expect(kinds(draft([text("架空。")], `短い。${"あ".repeat(60)}。`))).toEqual([])
    })

    it("見出しが30字なら通り、31字か疑問文なら差し戻す", () => {
      expect(kinds(withHeading("あ".repeat(30)))).toEqual([])
      expect(kinds(withHeading("あ".repeat(31)))).toEqual(["bad-heading"])
      expect(kinds(withHeading("架空の原因は何か？"))).toEqual(["bad-heading"])
      expect(kinds(withHeading("what?"))).toEqual(["bad-heading"])
    })

    it("figure の分数は差し戻し、件数や単位つきの数は通る", () => {
      const withFigure = (figure: string): ReportDraft => ({
        ...draft([text("架空。")]),
        checks: [check(figure)],
      })
      expect(kinds(withFigure("2849 / 56"))).toEqual(["fraction-figure"])
      expect(kinds(withFigure("1/2"))).toEqual(["fraction-figure"])
      expect(kinds(withFigure("56 件中 1 件"))).toEqual([])
      expect(kinds(withFigure("ずれ 2px"))).toEqual([])
      expect(kinds(withFigure(""))).toEqual([])
    })

    it("unverified の行の確かめ方が空なら差し戻し、ok・ng の空は通す", () => {
      const withCheck = (status: "ok" | "ng" | "unverified", howToVerify: string): ReportDraft => ({
        ...draft([text("架空。")]),
        checks: [{ ...check(""), status, howToVerify }],
      })
      expect(kinds(withCheck("unverified", ""))).toEqual(["unverified-without-how"])
      expect(kinds(withCheck("unverified", "  "))).toEqual(["unverified-without-how"])
      expect(kinds(withCheck("unverified", "架空の窓を開いて札を見る"))).toEqual([])
      expect(kinds(withCheck("ok", ""))).toEqual([])
      expect(kinds(withCheck("ng", ""))).toEqual([])
    })
  })

  describe("矢印と「名前: 説明」", () => {
    const list = (
      items: readonly { label?: string; text: string }[],
      style: "bullet" | "ordered" | "flow" = "bullet",
    ): ReportBlock => ({
      kind: "list",
      style,
      items: items.map((item) => ({ label: item.label ?? "", text: item.text, done: false })),
      fold: "",
    })
    const table = (
      cell: Extract<ReportBlock, { readonly kind: "table" }>["rows"][number][number],
    ): ReportBlock => ({
      kind: "table",
      title: "架空の表",
      columns: ["列", "値"],
      rows: [["a", cell]],
      rest: "",
      fold: "",
    })

    it("地の文と表のセルの A → B は差し戻す", () => {
      expect(kinds(draft([text("架空の旧 → 架空の新に変わる。")]))).toEqual(["arrow-in-prose"])
      expect(kinds(draft([table("架空の旧 → 架空の新")]))).toEqual(["arrow-in-prose"])
    })

    it("インラインコードの中・from/to・flow の項目・矢印の無い文は通る", () => {
      expect(kinds(draft([text("`a → b` と書く。")]))).toEqual([])
      expect(kinds(draft([table({ from: "架空の旧", to: "架空の新" })]))).toEqual([])
      expect(
        kinds(draft([list([{ text: "架空の段" }, { text: "架空の次の段" }], "flow")])),
      ).toEqual([])
      expect(kinds(draft([text("架空の-->と=>は対象外。")]))).toEqual([])
    })

    it("項目の頭の「名前: 説明」は差し戻す", () => {
      expect(kinds(draft([list([{ text: "名前: 架空の説明" }])]))).toEqual(["label-in-item"])
      expect(kinds(draft([list([{ text: "名前：架空の説明" }])]))).toEqual(["label-in-item"])
    })

    it("label がある項目・URL・時刻・インラインコードの頭・長い頭は通る", () => {
      expect(kinds(draft([list([{ label: "名前", text: "架空の説明" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "https://example.com を開く" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "12:30 に始まる" }])]))).toEqual([])
      expect(kinds(draft([list([{ text: "`a: b` を渡す" }])]))).toEqual([])
      expect(
        kinds(
          draft([list([{ text: "架空の文が長く続いてからやっと出てくるコロンの説明: 以下" }])]),
        ),
      ).toEqual([])
      expect(kinds(draft([list([{ text: "架空の文。次の文: 以下" }])]))).toEqual([])
    })

    it("3段以上の ordered で全項目に label があれば flow へ差し戻す", () => {
      const stages = [
        { label: "架空の段", text: "架空の説明" },
        { label: "架空の次の段", text: "架空の説明" },
        { label: "架空の最後の段", text: "架空の説明" },
      ]
      expect(kinds(draft([list(stages, "ordered")]))).toEqual(["labeled-ordered"])
      expect(kinds(draft([list(stages, "flow")]))).toEqual([])
      expect(kinds(draft([list(stages.slice(0, 2), "ordered")]))).toEqual([])
      expect(
        kinds(draft([list([...stages.slice(0, 2), { text: "架空の説明" }], "ordered")])),
      ).toEqual([])
    })
  })

  describe("日本語でない地の文・見出し", () => {
    it("仮名も漢字も無い英語の文は text でも見出しでも差し戻す", () => {
      expect(kinds(draft([text("Fixed the bug in the parser.")]))).toEqual(["non-japanese"])
      expect(
        kinds(
          draft([], "架空の結論。", [{ heading: "Root cause found", blocks: [text("架空。")] }]),
        ),
      ).toEqual(["non-japanese"])
    })

    it("日本語を含む文・コードやパスだけの文・語の少ない見出しは通る", () => {
      expect(kinds(draft([text("`parser.ts` の bug を直した。")]))).toEqual([])
      expect(kinds(draft([text("`Fixed the bug in the parser` と `src/a.ts`")]))).toEqual([])
      expect(kinds(draft([text("src/server/a.ts and src/server/b.ts")]))).toEqual([])
      expect(kinds(draft([text("[Fixed the bug in the parser](https://example.com/a)")]))).toEqual(
        [],
      )
      expect(
        kinds(draft([], "架空の結論。", [{ heading: "Parser", blocks: [text("架空。")] }])),
      ).toEqual([])
      expect(kinds(draft([text("OK")]))).toEqual([])
    })
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
        rest: "",
        fold: "",
      }
      expect(reportViolations(draft([table]))).toEqual([{ kind: "ragged-table", count: 1 }])
    })

    it("セルの数が揃わない行のある matrix も違反", () => {
      const matrix: ReportBlock = {
        kind: "matrix",
        title: "架空の対応",
        columns: ["列A", "列B"],
        rows: [{ name: "行1", cells: ["ok"] }],
        fold: "",
      }
      expect(reportViolations(draft([matrix]))).toEqual([{ kind: "ragged-table", count: 1 }])
    })
  })

  describe("chart の series の値の数は labels と揃える", () => {
    it("values の数が labels と揃わない系列があれば違反", () => {
      const chart: ReportBlock = {
        kind: "chart",
        title: "",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1] }],
        horizontal: false,
        fold: "",
      }
      expect(reportViolations(draft([chart]))).toEqual([{ kind: "ragged-chart", count: 1 }])
    })

    it("揃っていれば違反にしない", () => {
      const chart: ReportBlock = {
        kind: "chart",
        title: "",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1, 2] }],
        horizontal: false,
        fold: "",
      }
      expect(kinds(draft([chart]))).toEqual([])
    })

    it.each(["arrow", "slope"] as const)(
      "%s は series が前と後の2つでなければ違反",
      (chartKind) => {
        const chartOf = (seriesCount: number): ReportBlock => ({
          kind: "chart",
          title: "",
          chartKind,
          labels: ["架空A", "架空B"],
          series: Array.from({ length: seriesCount }, (_, index) => ({
            name: `架空系列${String(index)}`,
            values: [1, 2],
          })),
          horizontal: false,
          fold: "",
        })
        expect(kinds(draft([chartOf(1)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(3)]))).toEqual(["ragged-chart"])
        expect(kinds(draft([chartOf(2)]))).toEqual([])
      },
    )
  })

  describe("stats の series は3つ以上", () => {
    const statsOf = (series: readonly number[]): ReportBlock => ({
      kind: "stats",
      items: [
        { before: "", value: "1", total: "", label: "架空A", series, better: "" },
        { before: "", value: "2", total: "", label: "架空B", series: [], better: "" },
      ],
      fold: "",
    })

    it.each([
      [0, []],
      [1, ["short-series"]],
      [2, ["short-series"]],
      [3, []],
    ] as const)("series が%i個なら %j", (count, expected) => {
      const series = Array.from({ length: count }, (_, index) => index)
      expect(kinds(draft([statsOf(series)]))).toEqual(expected)
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

  describe("note は隣接させず、見出しの直後に置かない", () => {
    const info = (): ReportBlock => ({ kind: "note", tone: "info", text: "架空の一文。", fold: "" })

    it("info が隣り合えば違反", () => {
      expect(reportViolations(draft([info(), info()]))).toEqual([
        { kind: "crowded-notes", count: 1 },
      ])
    })

    it("間に別の塊があれば通る", () => {
      expect(kinds(draft([info(), text("架空の段落。"), info()]))).toEqual([])
    })

    it("見出しのある節の先頭の note は違反、見出しの無い節の先頭は通る", () => {
      const titled: readonly ReportSection[] = [{ heading: "架空の見出し", blocks: [info()] }]
      expect(kinds(draft([], "架空の結論。", titled))).toEqual(["crowded-notes"])
      expect(kinds(draft([info()]))).toEqual([])
    })

    it("warn / ng は隣接も見出しの直後も例外", () => {
      const ng = (): ReportBlock => ({ kind: "note", tone: "ng", text: "架空の一文。", fold: "" })
      const titled: readonly ReportSection[] = [{ heading: "架空の見出し", blocks: [ng(), note()] }]
      expect(kinds(draft([], "架空の結論。", titled))).toEqual([])
    })
  })

  describe("fold と details を入れ子にしない", () => {
    it("fold を持つ markdown の塊が details を含めば違反", () => {
      const block: ReportBlock = {
        kind: "markdown",
        markdown: "<details><summary>架空</summary>\n\n架空の本文\n\n</details>",
        fold: "架空の畳み",
      }
      expect(reportViolations(draft([block]))).toEqual([{ kind: "nested-fold", count: 1 }])
    })

    it("details の中の details は違反", () => {
      const nested = "<details>\n<details>\n\n架空\n\n</details>\n</details>"
      expect(kinds(draft([markdown(nested)]))).toEqual(["nested-fold"])
    })

    it("fold の無い単独の details は通る", () => {
      expect(kinds(draft([markdown("<details>\n\n架空\n\n</details>")]))).toEqual([])
    })
  })

  describe("候補は5つまで", () => {
    const options = (count: number): ReportBlock => ({
      kind: "options",
      title: "架空の比較",
      items: Array.from({ length: count }, () => ({
        name: "架空",
        verdict: "consider" as const,
        reason: "架空の理由。",
      })),
      fold: "",
    })
    const compare = (count: number): ReportBlock => ({
      kind: "compare",
      title: "架空の比較",
      sides: [
        { heading: "案A", points: Array.from({ length: count }, () => "架空") },
        { heading: "案B", points: ["架空"] },
      ],
      fold: "",
    })
    const image = (count: number): ReportBlock => ({
      kind: "image",
      path: "架空.png",
      caption: "架空の画面",
      notes: Array.from({ length: count }, () => "架空の場所"),
      fold: "",
    })

    const beforeAfter = (count: number): ReportBlock => ({
      kind: "beforeAfter",
      title: "架空の前後",
      before: { kind: "points", points: ["架空"] },
      after: { kind: "points", points: Array.from({ length: count }, () => "架空") },
      fold: "",
    })

    it("上限を1つ超えたら違反", () => {
      const over = MAX_CANDIDATES + 1
      expect(
        reportViolations(draft([options(over), compare(over), image(over), beforeAfter(over)])),
      ).toEqual([{ kind: "too-many-candidates", count: 4 }])
    })

    it("上限ちょうどなら通る", () => {
      const max = MAX_CANDIDATES
      expect(kinds(draft([options(max), compare(max), image(max), beforeAfter(max)]))).toEqual([])
    })

    it("差し戻しの文面に上限の数が出る", () => {
      const text = reportRejectionText([{ kind: "too-many-candidates", count: 1 }])
      expect(text).toContain(`${String(MAX_CANDIDATES + 1)}つ以上`)
      expect(text).toContain(`${String(MAX_CANDIDATES)}つまでに絞る`)
    })
  })

  describe("候補は採る → 検討 → 採らないの順", () => {
    const options = (verdicts: readonly ("adopt" | "consider" | "reject")[]): ReportBlock => ({
      kind: "options",
      title: "架空の比較",
      items: verdicts.map((verdict) => ({ name: "架空", verdict, reason: "架空の理由。" })),
      fold: "",
    })

    it("採る候補より前に別の判定があれば違反", () => {
      expect(
        reportViolations(draft([options(["consider", "adopt"]), options(["reject", "consider"])])),
      ).toEqual([{ kind: "unordered-options", count: 2 }])
    })

    it("順に並んでいれば、抜けている判定や同じ判定の連続があっても通る", () => {
      expect(
        kinds(draft([options(["adopt", "adopt", "reject"]), options(["consider", "reject"])])),
      ).toEqual([])
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

    it("他の規約違反と同じ report にあれば、1回の差し戻しで両方返る", () => {
      const report = withFile(
        [note(), note(), note(), code("src/fixture-e.ts", "架空の行")],
        new Map(),
      )
      expect(kinds(report)).toEqual(["too-many-notes", "code-mismatch"])
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
        { kind: "beforeAfter", title: "", before: side, after: side, fold: "" },
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
        ...draft([{ kind: "graph", title: "", direction: "TD", source: "A -> B", fold: "" }]),
        figure: { kind: "graph", title: "", direction: "TD", source: "A ->", fold: "" },
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
        },
      }
      expect(kinds(report)).toEqual(["broken-svg"])
      expect(
        kinds({
          ...draft([]),
          figure: { kind: "mermaid", title: "", source: "flowchart TD", fold: "" },
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
        { kind: "graph", title: "", direction: "TD", source: "A -> B", fold: "" },
      ] as const) {
        expect(kinds({ ...draft([], "架空の結論。", sections), figure })).toEqual([])
      }
    })
  })
})
