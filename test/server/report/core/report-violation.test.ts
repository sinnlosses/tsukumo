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
  fileContents: new Map(),
})

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

    it("6つ目から違反", () => {
      expect(reportViolations(draft([options(6), compare(6), image(6), beforeAfter(6)]))).toEqual([
        { kind: "too-many-candidates", count: 4 },
      ])
    })

    it("5つなら通る", () => {
      expect(kinds(draft([options(5), compare(5), image(5), beforeAfter(5)]))).toEqual([])
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

    it("省略の行（// ...）で区切った断片が順に現れれば違反にしない", () => {
      const report = withFile(
        [code("src/fixture-c.ts", "架空の1行目\n// ...\n架空の4行目")],
        new Map([["src/fixture-c.ts", "架空の1行目\n架空の2行目\n架空の3行目\n架空の4行目"]]),
      )
      expect(kinds(report)).toEqual([])
    })

    it("diff の - 行は無視し、+ と文脈の行だけ照合する", () => {
      const report = withFile(
        [code("src/fixture-d.ts", "@@ -1,2 +1,2 @@\n-古い行\n+架空の1行目\n 架空の2行目", "diff")],
        new Map([["src/fixture-d.ts", "架空の1行目\n架空の2行目"]]),
      )
      expect(kinds(report)).toEqual([])
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
})
