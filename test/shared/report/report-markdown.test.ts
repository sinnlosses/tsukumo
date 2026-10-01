import { describe, expect, it } from "vitest"

import {
  type ReportBlock,
  type ReportSection,
  reportSectionsOfBody,
} from "../../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"

const section = (blocks: readonly ReportBlock[], heading = ""): ReportSection => ({
  heading,
  blocks,
})
const markdownOf = (block: ReportBlock): string => reportSectionsMarkdown([section([block])])
const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "" })

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
      '## 架空の節\n\n架空の一。\n\n<div class="report-section-break"></div>\n\n' +
        "## 架空の次の節\n\n架空の二。",
    )
  })

  it("節と節の境目には見た目を持たない印を挟む。見出しの無い節どうしでも挟む", () => {
    const sections = [section([text("架空の一。")]), section([text("架空の二。")])]

    expect(reportSectionsMarkdown(sections)).toBe(
      '架空の一。\n\n<div class="report-section-break"></div>\n\n架空の二。',
    )
  })

  it("箇条書き・番号付き・チェックリストを組む", () => {
    const items = [
      { label: "", text: "架空の一", done: true },
      { label: "", text: "架空の二", done: false },
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

  it("表は太字1行の見出しのあとに GFM の表で組み、状態のセルは上下2段（記号付きの印／状態の文）で左に揃える（書き手の文字と同じなら文の段を重ねない）", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "架空の表",
      columns: ["項目", "結果"],
      rows: [
        ["架空の a|b", { status: "ok", text: "通過" }],
        ["架空の c", { status: "ng", text: "NG" }],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "**架空の表**",
        "",
        "| 項目 | 結果 |",
        "| --- | --- |",
        '| 架空の a\\|b | <span class="cell-status cell-status-ok"><span class="cell-status-mark">✓ OK</span><span class="cell-status-text">通過</span></span> |',
        '| 架空の c | <span class="cell-status cell-status-ng"><span class="cell-status-mark">✕ NG</span></span> |',
      ].join("\n"),
    )
  })

  it("列の全セルが数なら右揃え（桁を縦に揃える）にする。単位が付くと数だけの列にならない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数", "割合"],
      rows: [
        ["架空の a", "312", "12.5%"],
        ["架空の b", "-8", "架空の8件"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "| 項目 | 件数 | 割合 |",
        "| --- | ---: | --- |",
        "| 架空の a | 312 | 12.5% |",
        "| 架空の b | -8 | 架空の8件 |",
      ].join("\n"),
    )
  })

  it("変わったセルは前の値と矢印の文字を ink-quiet の span に、後の値を地の文字にし、前後がどちらも数なら列を右に揃える", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数", "名前"],
      rows: [
        ["架空の a", { from: "12", to: "8" }, { from: "`old|x`", to: "架空の新" }],
        ["架空の b", "3", "架空の据え置き"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "| 項目 | 件数 | 名前 |",
        "| --- | ---: | --- |",
        '| 架空の a | <span class="change-from">12 →</span> 8 | <span class="change-from">`old\\|x` →</span> 架空の新 |',
        "| 架空の b | 3 | 架空の据え置き |",
      ].join("\n"),
    )
  })

  it("状態のセルと変わったセルが混じる列は中央に揃えない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "結果"],
      rows: [
        ["架空の a", { status: "ok", text: "" }],
        ["架空の b", { from: "架空の前", to: "架空の後" }],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toContain("| --- | --- |")
  })

  it("数だけの列（行が2つ以上・負の数なし）は、列の最大値に対する幅の棒を数字に重ねる", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [
        ["架空の a", "40"],
        ["架空の b", "10"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "| 項目 | 件数 |",
        "| --- | ---: |",
        '| 架空の a | <span class="cell-numeric"><span class="cell-bar" style="width: 100%"></span><span class="cell-numeric-value">40</span></span> |',
        '| 架空の b | <span class="cell-numeric"><span class="cell-bar" style="width: 25%"></span><span class="cell-numeric-value">10</span></span> |',
      ].join("\n"),
    )
  })

  it("行が1つの表には棒を出さない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [["架空の a", "40"]],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      ["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 40 |"].join("\n"),
    )
  })

  it("負の数を含む列には棒を出さない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [
        ["架空の a", "312"],
        ["架空の b", "-8"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      ["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 312 |", "| 架空の b | -8 |"].join("\n"),
    )
  })

  it("最大値が0（全セル0）の列には棒を出さない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [
        ["架空の a", "0"],
        ["架空の b", "0"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      ["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 0 |", "| 架空の b | 0 |"].join("\n"),
    )
  })

  it("前後がどちらも数の変化セルを含む列には棒を出さない", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [
        ["架空の a", { from: "12", to: "8" }],
        ["架空の b", "3"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      [
        "| 項目 | 件数 |",
        "| --- | ---: |",
        '| 架空の a | <span class="change-from">12 →</span> 8 |',
        "| 架空の b | 3 |",
      ].join("\n"),
    )
  })

  it("stats の before は数の上に矢印の文字を添えて出し、差は出さない", () => {
    const stats: ReportBlock = {
      kind: "stats",
      items: [
        { before: "12", value: "8", total: "", label: "架空の件数" },
        { before: "", value: "0", total: "", label: "架空の失敗" },
      ],
      fold: "",
    }

    expect(markdownOf(stats)).toBe(
      '<div class="stats"><div class="stat"><span class="stat-before">12 →</span><b>8</b>架空の件数</div>' +
        '<div class="stat"><b>0</b>架空の失敗</div></div>',
    )
  })

  it("名前のある並びは印を保ったまま名前と説明を span に分けて容れ物で包み、名前の無い項目も同じ形にする", () => {
    const items = [
      { label: "架空の名前", text: "架空の **説明**", done: true },
      { label: "", text: "架空の説明だけ", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "check", items, fold: "" })).toBe(
      [
        '<div class="labeled-list">',
        "",
        '- [x] <span class="list-label">架空の名前</span><span class="list-text">架空の **説明**</span>',
        '- [ ] <span class="list-label"></span><span class="list-text">架空の説明だけ</span>',
        "",
        "</div>",
      ].join("\n"),
    )
  })

  it("flow は項目を札にして札の間に下向きの矢印を置き、名前があれば札の頭に太字で添える", () => {
    const items = [
      { label: "", text: "架空の `入口`", done: false },
      { label: "架空の段", text: "架空の<中>", done: true },
      { label: "", text: "架空の出口", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "flow", items, fold: "" })).toBe(
      '<div class="flow"><span class="flow-step">架空の <code>入口</code></span>' +
        '<span class="flow-arrow">↓</span><span class="flow-step"><b>架空の段</b>架空の&lt;中&gt;</span>' +
        '<span class="flow-arrow">↓</span><span class="flow-step">架空の出口</span></div>',
    )
  })

  it("note は種別の class の塊で、中に Markdown を入れるので内側の前後に空行を空ける", () => {
    expect(markdownOf({ kind: "note", tone: "info", text: "架空の情報", fold: "" })).toBe(
      '<div class="note">\n\n架空の情報\n\n</div>',
    )
  })

  it("note の注意・異常は、書き上げる演出が筆を留める印（report-pause-point）を併せ持つ", () => {
    expect(markdownOf({ kind: "note", tone: "warn", text: "架空の注意", fold: "" })).toBe(
      '<div class="note note-warn report-pause-point">\n\n架空の注意\n\n</div>',
    )
    expect(markdownOf({ kind: "note", tone: "ng", text: "架空の異常", fold: "" })).toBe(
      '<div class="note note-ng report-pause-point">\n\n架空の異常\n\n</div>',
    )
  })

  it("stats は数の塊で、HTML の中なので値とラベルを HTML として逃がす", () => {
    const stats: ReportBlock = {
      kind: "stats",
      items: [
        { before: "", value: "312", total: "", label: "架空の<件数>" },
        { before: "", value: "0", total: "", label: "架空の失敗" },
      ],
      fold: "",
    }

    expect(markdownOf(stats)).toBe(
      '<div class="stats"><div class="stat"><b>312</b>架空の&lt;件数&gt;</div>' +
        '<div class="stat"><b>0</b>架空の失敗</div></div>',
    )
  })

  it("stats の値とラベルの inline code は code 要素にし、中の文字も HTML として逃がす", () => {
    const stats: ReportBlock = {
      kind: "stats",
      items: [
        { before: "", value: "`3`", total: "", label: "架空の `a<b` 件" },
        { before: "", value: "0", total: "", label: "架空の `` `x` `` 件" },
      ],
      fold: "",
    }

    expect(markdownOf(stats)).toBe(
      '<div class="stats"><div class="stat"><b><code>3</code></b>架空の <code>a&lt;b</code> 件</div>' +
        '<div class="stat"><b>0</b>架空の <code>`x`</code> 件</div></div>',
    )
  })

  it("stats の total は数の後ろに文字で添え、数が全体に収まる数字なら割合の帯も出す", () => {
    const stat = (value: string, total: string): string =>
      markdownOf({ kind: "stats", items: [{ before: "", value, total, label: "架空" }], fold: "" })
    const meter = (width: number): string =>
      `<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: ${String(width)}%"></span></span>`

    expect(stat("25", "28")).toBe(
      `<div class="stats"><div class="stat"><b>25<span class="stat-total"> / 28</span></b>${meter(89)}架空</div></div>`,
    )
    expect(stat("0", "56")).toContain(meter(0))
    expect(stat("1,000", "1,000")).toContain(meter(100))
  })

  it("stats の total が数として読めない・数が全体を超えるときは、帯を出さず total の文字だけを出す", () => {
    const stat = (value: string, total: string): string =>
      markdownOf({ kind: "stats", items: [{ before: "", value, total, label: "架空" }], fold: "" })

    expect(stat("25件", "28件")).toBe(
      '<div class="stats"><div class="stat"><b>25件<span class="stat-total"> / 28件</span></b>架空</div></div>',
    )
    expect(stat("30", "28")).not.toContain("stat-meter")
    expect(stat("1", "0")).not.toContain("stat-meter")
    expect(stat("3", "<5>")).toContain(" / &lt;5&gt;")
  })

  it("progress は節（丸）と線でつないだ1本の道で、済んだ段・いまの段・まだの段を class と aria-current・aria-label で見分ける", () => {
    const progress: ReportBlock = {
      kind: "progress",
      steps: ["架空の一", "架空の二", "架空の三"],
      current: 1,
      fold: "",
    }

    expect(markdownOf(progress)).toBe(
      '<ol class="progress" aria-label="進み具合">' +
        '<li class="progress-step progress-step-done" aria-label="架空の一：済">' +
        '<span class="progress-dot" aria-hidden="true">✓</span>' +
        '<span class="progress-name">架空の一</span></li>' +
        '<li class="progress-line progress-line-done" aria-hidden="true"></li>' +
        '<li class="progress-step progress-step-current" aria-current="step" aria-label="架空の二：進行中">' +
        '<span class="progress-dot" aria-hidden="true"><span class="progress-dot-mark"></span></span>' +
        '<span class="progress-name">架空の二</span><span class="progress-status">進行中</span></li>' +
        '<li class="progress-line" aria-hidden="true"></li>' +
        '<li class="progress-step" aria-label="架空の三：まだ">' +
        '<span class="progress-dot" aria-hidden="true"></span>' +
        '<span class="progress-name">架空の三</span></li>' +
        "</ol>",
    )
  })

  it("progress の名前の無い段は1始まりの番号を名前にする", () => {
    const progress: ReportBlock = {
      kind: "progress",
      steps: ["", ""],
      current: 1,
      fold: "",
    }

    expect(markdownOf(progress)).toBe(
      '<ol class="progress" aria-label="進み具合">' +
        '<li class="progress-step progress-step-done" aria-label="1：済">' +
        '<span class="progress-dot" aria-hidden="true">✓</span>' +
        '<span class="progress-name">1</span></li>' +
        '<li class="progress-line progress-line-done" aria-hidden="true"></li>' +
        '<li class="progress-step progress-step-current" aria-current="step" aria-label="2：進行中">' +
        '<span class="progress-dot" aria-hidden="true"><span class="progress-dot-mark"></span></span>' +
        '<span class="progress-name">2</span><span class="progress-status">進行中</span></li>' +
        "</ol>",
    )
    expect(markdownOf({ ...progress, current: 0 })).toContain(
      '<li class="progress-step" aria-label="2：まだ">' +
        '<span class="progress-dot" aria-hidden="true"></span>' +
        '<span class="progress-name">2</span></li>',
    )
  })

  it("options は太字の見出しのあとに候補を書き手の順のままカードにし、頭に判定の語のバッジを置く", () => {
    const options: ReportBlock = {
      kind: "options",
      title: "架空の比較",
      items: [
        { name: "架空の案A", verdict: "reject", reason: "架空の<理由>" },
        { name: "架空の `案B`", verdict: "adopt", reason: "架空の理由" },
        { name: "架空の案C", verdict: "consider", reason: "" },
      ],
      fold: "",
    }

    // 採る候補を先頭へ動かさない（並べ替えは再構成）。「採る」は演出が筆を留める印（report-pause-point）を併せ持つ。
    expect(markdownOf(options)).toBe(
      "**架空の比較**\n\n" +
        '<div class="options">' +
        '<div class="option option-reject"><div><span class="badge">採らない</span> <b>架空の案A</b></div>架空の&lt;理由&gt;</div>' +
        '<div class="option option-adopt report-pause-point"><div><span class="badge badge-ok">採る</span> <b>架空の <code>案B</code></b></div>架空の理由</div>' +
        '<div class="option"><div><span class="badge">検討</span> <b>架空の案C</b></div></div>' +
        "</div>",
    )
  })

  it("matrix は名前だけの見出しの格子に状態の印を置き、凡例は格子に出た状態だけを並べる", () => {
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "架空の対応",
      columns: ["列|A", "列B"],
      rows: [
        { name: "行1", cells: ["ok", "ng"] },
        { name: "行2", cells: ["na", "ok"] },
      ],
      fold: "",
    }

    const mark = (className: string, label: string, symbol: string): string =>
      `<span class="matrix-mark ${className}" role="img" aria-label="${label}">${symbol}</span>`
    expect(markdownOf(matrix)).toBe(
      "**架空の対応**\n\n" +
        '<div class="matrix">\n\n' +
        "|  | 列\\|A | 列B |\n| --- | :---: | :---: |\n" +
        `| 行1 | ${mark("matrix-mark-ok", "OK", "✓")} | ${mark("matrix-mark-ng", "NG", "✕")} |\n` +
        `| 行2 | ${mark("matrix-mark-na", "該当なし", "－")} | ${mark("matrix-mark-ok", "OK", "✓")} |\n\n` +
        '<div class="matrix-legend">' +
        '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-ok" aria-hidden="true">✓</span> OK</span>' +
        '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-ng" aria-hidden="true">✕</span> NG</span>' +
        '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-na" aria-hidden="true">－</span> 該当なし</span>' +
        "</div>\n\n</div>",
    )
  })

  it("files は1行に1ファイルで、種別の語・code 要素のパス・注記を並べ、注記が空なら置かない", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [
        { path: "src/架空<a>.ts", change: "modified", note: "架空の `注記`" },
        { path: "src/架空`b`.ts", change: "added", note: "" },
        { path: "src/架空c.ts", change: "deleted", note: "" },
        { path: "docs/架空d.md", change: "read", note: "" },
      ],
      fold: "",
    }

    // パスは inline code の記法として解かず、そのまま code 要素の文字にする（バッククォートを含むパスも崩さない）。
    expect(markdownOf(files)).toBe(
      '<div class="files">' +
        '<div class="file"><span class="file-change">変更</span><code>src/架空&lt;a&gt;.ts</code><span class="file-note">架空の <code>注記</code></span></div>' +
        '<div class="file"><span class="file-change">追加</span><code>src/架空`b`.ts</code></div>' +
        '<div class="file"><span class="file-change">削除</span><code>src/架空c.ts</code></div>' +
        '<div class="file"><span class="file-change">読んだ</span><code>docs/架空d.md</code></div>' +
        "</div>",
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

  it("chart は Chart.js の設定を組んで chart フェンスに JSON で書く。pie は先頭の系列だけを使う", () => {
    expect(
      markdownOf({
        kind: "chart",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1, 2] }],
        horizontal: false,
        fold: "",
      }),
    ).toBe(
      "```chart\n" +
        JSON.stringify({
          type: "bar",
          data: { labels: ["架空A", "架空B"], datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: {},
        }) +
        "\n```",
    )
    expect(
      markdownOf({
        kind: "chart",
        chartKind: "bar",
        labels: ["架空A", "架空B"],
        series: [{ name: "架空系列", values: [1, 2] }],
        horizontal: true,
        fold: "",
      }),
    ).toBe(
      "```chart\n" +
        JSON.stringify({
          type: "bar",
          data: { labels: ["架空A", "架空B"], datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: { indexAxis: "y" },
        }) +
        "\n```",
    )
    expect(
      markdownOf({
        kind: "chart",
        chartKind: "line",
        labels: ["架空A", "架空B"],
        series: [
          { name: "架空系列1", values: [1, 2] },
          { name: "架空系列2", values: [3, 4] },
        ],
        horizontal: false,
        fold: "",
      }),
    ).toBe(
      "```chart\n" +
        JSON.stringify({
          type: "line",
          data: {
            labels: ["架空A", "架空B"],
            datasets: [
              { label: "架空系列1", data: [1, 2] },
              { label: "架空系列2", data: [3, 4] },
            ],
          },
          options: {},
        }) +
        "\n```",
    )
    expect(
      markdownOf({
        kind: "chart",
        chartKind: "pie",
        labels: ["架空A", "架空B"],
        series: [
          { name: "架空系列1", values: [1, 2] },
          { name: "架空系列2", values: [3, 4] },
        ],
        horizontal: false,
        fold: "",
      }),
    ).toBe(
      "```chart\n" +
        JSON.stringify({
          type: "pie",
          data: {
            labels: ["架空A", "架空B"],
            datasets: [{ label: "架空系列1", data: [1, 2] }],
          },
          options: {},
        }) +
        "\n```",
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

    it("行頭が3連バッククォートでも、同じ行にバッククォートがあればフェンスでなく inline code なので逃がさない", () => {
      expect(markdownOf(text("```x``` と書く"))).toBe("```x``` と書く")
    })

    it("箇条書きの項目の行頭も逃がす", () => {
      expect(
        markdownOf({
          kind: "list",
          style: "bullet",
          items: [{ label: "", text: "## 架空", done: false }],
          fold: "",
        }),
      ).toBe("- \\## 架空")
    })
  })
})
