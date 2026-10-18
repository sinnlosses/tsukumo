import { describe, expect, it } from "vitest"

import { encodeMarks } from "../../../src/shared/report/code-mark.ts"
import {
  type ReportBlock,
  type ReportSection,
  reportSectionsOfBody,
} from "../../../src/shared/report/report-block.ts"
import { reportImagePath } from "../../../src/shared/report/report-image.ts"
import {
  type ReportImageSource,
  reportSectionsMarkdown,
} from "../../../src/shared/report/report-markdown.ts"

const NO_IMAGES = { kind: "none" } as const satisfies ReportImageSource

const section = (blocks: readonly ReportBlock[], heading = ""): ReportSection => ({
  heading,
  blocks,
})
const markdownOf = (block: ReportBlock): string =>
  reportSectionsMarkdown([section([block])], NO_IMAGES)
const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "", aside: "" })
const captionRow = (label: "図" | "表", ordinal: number, title = ""): string =>
  `<div class="caption"><span class="caption-number">${label} ${String(ordinal)}</span>` +
  `${title === "" ? "" : `<span class="caption-text">${title}</span>`}</div>`
/** 図の包み。本体が HTML だけなら空行を挟まず、題の行は本体のあと。 */
const figureCaptioned = (body: string, title = "", ordinal = 1, fit = true): string =>
  `<div class="captioned${fit ? " captioned-fit" : ""}">${body}${captionRow("図", ordinal, title)}</div>`
/** 図の包み（本体が Markdown のフェンスで、空行で区切る）。 */
const fencedFigureCaptioned = (body: string, title = "", ordinal = 1): string =>
  `<div class="captioned">\n\n${body}\n\n${captionRow("図", ordinal, title)}\n\n</div>`
const GRAPH_SHAPE_LEGEND =
  '<div class="graph-legend">' +
  [
    ["round", "入口・出口"],
    ["box", "処理"],
    ["decision", "分岐"],
  ]
    .map(
      ([shape, label]) =>
        `<span class="graph-legend-item"><span class="graph-legend-shape graph-legend-shape-${shape}" aria-hidden="true"></span>${label}</span>`,
    )
    .join("") +
  "</div>"
type StatItem = Extract<ReportBlock, { readonly kind: "stats" }>["items"][number]
const graphMarkdown = (source: string, title = ""): string =>
  markdownOf({ kind: "graph", title, direction: "LR", source, fold: "", aside: "" })
const statItem: StatItem = { before: "", value: "", total: "", label: "", series: [], better: "" }
const statsCaptioned = (body: string, ordinal = 1): string =>
  figureCaptioned(body, "", ordinal, false)
/** 図の包みから、本体のフェンスだけを取り出す。 */
const chartFenceOf = (block: ReportBlock): string =>
  markdownOf(block)
    .replace(/^<div class="captioned">\n\n/, "")
    .replace(/\n\n<div class="caption">.*<\/div>\n\n<\/div>$/, "")
const captionNumbers = (sections: readonly ReportSection[]): string[] =>
  [...reportSectionsMarkdown(sections, NO_IMAGES).matchAll(/class="caption-number">([^<]+)</g)].map(
    ([, label]) => label ?? "",
  )
/** 表の包み。題の行は本体の前、本体のあとに空行で閉じる。 */
const tableCaptioned = (body: string, title = "", ordinal = 1): string =>
  `<div class="captioned captioned-fit">\n\n${captionRow("表", ordinal, title)}\n\n${body}\n\n</div>`

describe("reportSectionsMarkdown", () => {
  it("逃げ道の塊は中身をそのまま出し、本文から畳んだ節は元の本文と同じ Markdown になる", () => {
    const body = '## 架空の見出し\n\n<div class="note">架空の注記</div>\n\n- 架空の項目'

    expect(reportSectionsMarkdown(reportSectionsOfBody(body), NO_IMAGES)).toBe(body)
    expect(reportSectionsMarkdown([], NO_IMAGES)).toBe("")
  })

  it("節の見出しは ## で出し、塊と節は空行で区切る。空の見出し・空の塊は置かない", () => {
    const sections = [
      section([text("架空の一。"), text(" ")], "架空の節"),
      section([{ kind: "markdown", markdown: "", fold: "", aside: "" }], ""),
      section([text("架空の二。")], "架空の次の節"),
    ]

    expect(reportSectionsMarkdown(sections, NO_IMAGES)).toBe(
      '## 架空の節\n\n架空の一。\n\n<div class="report-section-break"></div>\n\n' +
        "## 架空の次の節\n\n架空の二。",
    )
  })

  it("節と節の境目には見た目を持たない印を挟む。見出しの無い節どうしでも挟む", () => {
    const sections = [section([text("架空の一。")]), section([text("架空の二。")])]

    expect(reportSectionsMarkdown(sections, NO_IMAGES)).toBe(
      '架空の一。\n\n<div class="report-section-break"></div>\n\n架空の二。',
    )
  })

  it("箇条書き・番号付き・チェックリストを組む", () => {
    const items = [
      { label: "", text: "架空の一", done: true },
      { label: "", text: "架空の二", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "bullet", items, fold: "", aside: "" })).toBe(
      "- 架空の一\n- 架空の二",
    )
    expect(markdownOf({ kind: "list", style: "ordered", items, fold: "", aside: "" })).toBe(
      "1. 架空の一\n2. 架空の二",
    )
    expect(markdownOf({ kind: "list", style: "check", items, fold: "", aside: "" })).toBe(
      "- [x] 架空の一\n- [ ] 架空の二",
    )
  })

  it("表は番号つきの題の行のあとに GFM の表で組み、状態のセルは記号と文を1行に並べたタイルにし、題の直下に出た状態だけの凡例を添える（記号は role=img の aria-label で状態語を読み上げる）", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "架空の表",
      columns: ["項目", "結果", "備考"],
      rows: [
        ["架空の a|b", { status: "ok", text: "通過" }, "架空の備考"],
        ["架空の c", { status: "ng", text: "NG" }, "架空の備考"],
        ["架空の d", "架空の同じ", "架空の備考"],
      ],
      rest: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(table)).toBe(
      tableCaptioned(
        [
          '<div class="table-status-legend"><span class="table-status-legend-item"><span class="table-status-legend-swatch cell-status-ok" aria-hidden="true"></span><span class="cell-status-mark cell-status-ok" aria-hidden="true">✓</span> OK</span><span class="table-status-legend-item"><span class="table-status-legend-swatch cell-status-ng" aria-hidden="true"></span><span class="cell-status-mark cell-status-ng" aria-hidden="true">✕</span> NG</span></div>',
          "",
          "| 項目 | 結果 | 備考 |",
          "| --- | --- | --- |",
          '| 架空の a\\|b | <span class="cell-status cell-status-ok"><span class="cell-status-mark cell-status-ok" role="img" aria-label="OK">✓</span><span class="cell-status-text">通過</span></span> | 架空の備考 |',
          '| 架空の c | <span class="cell-status cell-status-ng"><span class="cell-status-mark cell-status-ng" role="img" aria-label="NG">✕</span><span class="cell-status-text">NG</span></span> | 架空の備考 |',
          '| 架空の d | <span class="cell-status-none">架空の同じ</span> | 架空の備考 |',
        ].join("\n"),
        "架空の表",
      ),
    )
  })

  it("rest がある表は、表のあとに同じ包みの中で切った残りの1行を添える。状態のセルの表でも凡例・表・rest の順", () => {
    const plain: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "備考"],
      rows: [["架空の a", "架空の備考"]],
      rest: "ほか 12 件（0.5% 未満）",
      fold: "",
      aside: "",
    }
    const withStatus: ReportBlock = {
      ...plain,
      rows: [["架空の a", { status: "ok", text: "通過" }]],
    }

    expect(markdownOf(plain)).toBe(
      tableCaptioned(
        [
          "| 項目 | 備考 |",
          "| --- | --- |",
          "| 架空の a | 架空の備考 |",
          "",
          '<div class="table-rest">ほか 12 件（0.5% 未満）</div>',
        ].join("\n"),
      ),
    )
    const status = markdownOf(withStatus)
    expect(status.indexOf("table-status-legend")).toBeLessThan(status.indexOf("| 項目 | 備考 |"))
    expect(status.indexOf("| 項目 | 備考 |")).toBeLessThan(status.indexOf("table-rest"))
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
      rest: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(table)).toBe(
      tableCaptioned(
        [
          "| 項目 | 件数 | 名前 |",
          "| --- | ---: | --- |",
          '| 架空の a | <span class="change-from">12 →</span> 8 | <span class="change-from">`old\\|x` →</span> 架空の新 |',
          "| 架空の b | 3 | 架空の据え置き |",
        ].join("\n"),
      ),
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
      rest: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(table)).toContain("| --- | --- |")
  })

  const bar = (width: number, value: string): string =>
    `<span class="cell-numeric"><span class="cell-bar" style="width: ${String(width)}%"></span><span class="cell-numeric-value">${value}</span></span>`

  it.each([
    [
      "列の全セルが数なら右揃えにする。単位が付くと数だけの列にならない",
      ["項目", "件数", "割合"],
      [
        ["架空の a", "312", "12.5%"],
        ["架空の b", "-8", "架空の8件"],
      ],
      ["| --- | ---: | --- |", "| 架空の a | 312 | 12.5% |", "| 架空の b | -8 | 架空の8件 |"],
    ],
    [
      "数だけの列（行が2つ以上・負の数なし）は、列の最大値に対する幅の棒を数字に重ねる",
      ["項目", "件数"],
      [
        ["架空の a", "40"],
        ["架空の b", "10"],
      ],
      ["| --- | ---: |", `| 架空の a | ${bar(100, "40")} |`, `| 架空の b | ${bar(25, "10")} |`],
    ],
    [
      "行が1つの表には棒を出さない",
      ["項目", "件数"],
      [["架空の a", "40"]],
      ["| --- | ---: |", "| 架空の a | 40 |"],
    ],
    [
      "負の数を含む列には棒を出さない",
      ["項目", "件数"],
      [
        ["架空の a", "312"],
        ["架空の b", "-8"],
      ],
      ["| --- | ---: |", "| 架空の a | 312 |", "| 架空の b | -8 |"],
    ],
    [
      "最大値が0（全セル0）の列には棒を出さない",
      ["項目", "件数"],
      [
        ["架空の a", "0"],
        ["架空の b", "0"],
      ],
      ["| --- | ---: |", "| 架空の a | 0 |", "| 架空の b | 0 |"],
    ],
    [
      "前後がどちらも数の変化セルを含む列には棒を出さない",
      ["項目", "件数"],
      [
        ["架空の a", { from: "12", to: "8" }],
        ["架空の b", "3"],
      ],
      [
        "| --- | ---: |",
        '| 架空の a | <span class="change-from">12 →</span> 8 |',
        "| 架空の b | 3 |",
      ],
    ],
  ] as const)("%s", (_, columns, rows, lines) => {
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns,
      rows,
      rest: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(table)).toBe(
      tableCaptioned([`| ${columns.join(" | ")} |`, ...lines].join("\n")),
    )
  })

  it.each([
    [
      "before は数の上に矢印の文字を添えて出し、差は出さない",
      [
        { ...statItem, before: "12", value: "8", label: "架空の件数" },
        { ...statItem, value: "0", label: "架空の失敗" },
      ],
      '<div class="stat"><span class="stat-before">12 →</span><b>8</b>架空の件数</div>' +
        '<div class="stat"><b>0</b>架空の失敗</div>',
    ],
    [
      "値とラベルは HTML として逃がす",
      [
        { ...statItem, value: "312", label: "架空の<件数>" },
        { ...statItem, value: "0", label: "架空の失敗" },
      ],
      '<div class="stat"><b>312</b>架空の&lt;件数&gt;</div><div class="stat"><b>0</b>架空の失敗</div>',
    ],
    [
      "値とラベルの inline code は code 要素にし、中の文字も HTML として逃がす",
      [
        { ...statItem, value: "`3`", label: "架空の `a<b` 件" },
        { ...statItem, value: "0", label: "架空の `` `x` `` 件" },
      ],
      '<div class="stat"><b><code>3</code></b>架空の <code>a&lt;b</code> 件</div>' +
        '<div class="stat"><b>0</b>架空の <code>`x`</code> 件</div>',
    ],
  ])("stats の %s", (_, items, stats) => {
    expect(markdownOf({ kind: "stats", items, fold: "", aside: "" })).toBe(
      statsCaptioned(`<div class="stats">${stats}</div>`),
    )
  })

  it("名前のある並びは印を保ったまま名前と説明を span に分けて容れ物で包み、名前の無い項目も同じ形にする", () => {
    const items = [
      { label: "架空の名前", text: "架空の **説明**", done: true },
      { label: "", text: "架空の説明だけ", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "check", items, fold: "", aside: "" })).toBe(
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

  it("flow は番号の丸と線でつないだ ol/li で組み、名前があれば本文の頭に太字で添える", () => {
    const items = [
      { label: "", text: "架空の `入口`", done: false },
      { label: "架空の段", text: "架空の<中>", done: true },
      { label: "", text: "架空の出口", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "flow", items, fold: "", aside: "" })).toBe(
      '<ol class="flow" aria-label="流れ">' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">1</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span>架空の <code>入口</code></span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">2</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span><b>架空の段</b>架空の&lt;中&gt;</span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">3</span>' +
        "<span>架空の出口</span></li></ol>",
    )
  })

  it.each([
    ["info", "note"],
    ["warn", "note note-warn report-pause-point"],
    ["ng", "note note-ng report-pause-point"],
  ] as const)(
    "note の %s は種別の class の塊で、中に Markdown を入れるので内側の前後に空行を空ける。注意・異常は筆を留める印（report-pause-point）を併せ持つ",
    (tone, className) => {
      expect(markdownOf({ kind: "note", tone, text: "架空の本文", fold: "", aside: "" })).toBe(
        `<div class="${className}">\n\n架空の本文\n\n</div>`,
      )
    },
  )

  describe("stats の series と better", () => {
    const statsHtml = (item: Partial<StatItem>): string =>
      markdownOf({
        kind: "stats",
        items: [
          { ...statItem, value: "8", label: "架空", ...item },
          { ...statItem, value: "1" },
        ],
        fold: "",
        aside: "",
      })

    it("series が3つ以上なら value の左に折れ線と最新の円を描く", () => {
      const html = statsHtml({ series: [1, 3, 2] })

      expect(html).toContain(
        '<b><svg viewBox="0 0 48 12" aria-hidden="true">' +
          '<polyline points="1.5,10.5 24,1.5 46.5,6"/>' +
          '<circle cx="46.5" cy="6" r="1.2"/></svg>8</b>',
      )
    })

    it("全部同じ値の series は中央の水平線にする", () => {
      expect(statsHtml({ series: [5, 5, 5] })).toContain('points="1.5,6 24,6 46.5,6"')
    })

    it.each([[[]], [[1]], [[1, 2]]])("series が %j なら描かない", (series) => {
      expect(statsHtml({ series })).not.toContain("<svg")
    })

    it.each([
      ["up", "12", "8", "stat-before stat-worse"],
      ["up", "8", "12", "stat-before stat-better"],
      ["down", "12", "8", "stat-before stat-better"],
      ["down", "8", "12", "stat-before stat-worse"],
      ["down", "8", "8", "stat-before"],
      ["", "12", "8", "stat-before"],
      ["down", "約12", "8", "stat-before"],
    ] as const)("better が %s で %s → %s なら矢印の class は %s", (better, before, value, cls) => {
      expect(statsHtml({ better, before, value })).toContain(`<span class="${cls}">${before} →`)
    })

    it("増減の差は描かない", () => {
      expect(statsHtml({ better: "down", before: "12", value: "8" })).not.toMatch(/[−+-]\s?4/)
    })
  })

  const stat = (value: string, total: string): string =>
    markdownOf({
      kind: "stats",
      items: [{ ...statItem, value, total, label: "架空" }],
      fold: "",
      aside: "",
    })

  it("stats の total は数の後ろに文字で添え、数が全体に収まる数字なら割合の帯も出す", () => {
    const meter = (width: number): string =>
      `<span class="stat-meter" aria-hidden="true"><span class="stat-meter-fill" style="width: ${String(width)}%"></span></span>`

    expect(stat("25", "28")).toBe(
      statsCaptioned(
        `<div class="stats"><div class="stat"><b>25<span class="stat-total"> / 28</span></b>${meter(89)}架空</div></div>`,
      ),
    )
    expect(stat("0", "56")).toContain(meter(0))
    expect(stat("1,000", "1,000")).toContain(meter(100))
  })

  it("stats の total が数として読めない・数が全体を超えるときは、帯を出さず total の文字だけを出す", () => {
    expect(stat("25件", "28件")).toBe(
      statsCaptioned(
        '<div class="stats"><div class="stat"><b>25件<span class="stat-total"> / 28件</span></b>架空</div></div>',
      ),
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
      aside: "",
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
      aside: "",
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

  it("options は太字の見出しのあとに候補を書き手の順のまま1案1行にし、番号・判定の語・名前・理由の順に置く（理由が空なら理由の要素は無い）", () => {
    const options: ReportBlock = {
      kind: "options",
      title: "架空の比較",
      items: [
        { name: "架空の案A", verdict: "reject", reason: "架空の<理由>" },
        { name: "架空の `案B`", verdict: "adopt", reason: "架空の理由" },
        { name: "架空の案C", verdict: "consider", reason: "" },
      ],
      fold: "",
      aside: "",
    }

    // 判定の順が崩れていても並べ替えない（並べ替えは再構成で、順は検査が差し戻す）。「採る」は演出が筆を留める印（report-pause-point）を併せ持つ。
    expect(markdownOf(options)).toBe(
      "**架空の比較**\n\n" +
        '<div class="options">' +
        '<div class="option option-reject"><span class="option-number">1</span><span class="option-verdict">採らない</span><span class="option-body"><span class="option-name">架空の案A</span> <span class="option-reason">架空の&lt;理由&gt;</span></span></div>' +
        '<div class="option option-adopt report-pause-point"><span class="option-number">2</span><span class="option-verdict">採る</span><span class="option-body"><span class="option-name">架空の <code>案B</code></span> <span class="option-reason">架空の理由</span></span></div>' +
        '<div class="option option-consider"><span class="option-number">3</span><span class="option-verdict">検討</span><span class="option-body"><span class="option-name">架空の案C</span></span></div>' +
        "</div>",
    )
  })

  it("compare は2つの側を見出しと箇条の札にし、題の行を本体の下に置く（title が空なら番号だけ）", () => {
    const compare: ReportBlock = {
      kind: "compare",
      title: "架空の見比べ",
      sides: [
        { heading: "変更前", points: ["`a` を呼ぶ", "架空の<行>"] },
        { heading: "変更後", points: ["架空の1行"] },
      ],
      fold: "",
      aside: "",
    }
    const sides =
      '<div class="compare-side"><div class="compare-heading">変更前</div><ul><li><code>a</code> を呼ぶ</li><li>架空の&lt;行&gt;</li></ul></div>' +
      '<div class="compare-side"><div class="compare-heading">変更後</div><ul><li>架空の1行</li></ul></div>'

    const body = `<div class="compare">${sides}</div>`

    expect(markdownOf(compare)).toBe(figureCaptioned(body, "架空の見比べ", 1, false))
    expect(markdownOf({ ...compare, title: "" })).toBe(figureCaptioned(body, "", 1, false))
  })

  it("beforeAfter は前の側・矢印・後の側を並べ、見出しに「前」「後」を置き、画像は棚を引き、コードはフェンス、箇条は ul にする", () => {
    const beforeAfter: ReportBlock = {
      kind: "beforeAfter",
      title: "架空の<札>",
      before: { kind: "image", path: "架空/before.png" },
      after: { kind: "code", language: "ts", source: "const a = 1\n" },
      fold: "",
      aside: "",
    }
    const side = (label: string, labelClass: string, content: string): string =>
      `<div class="before-after-side">\n\n<div class="${labelClass}">${label}</div>\n\n${content}\n\n</div>`
    const body = (before: string, after: string): string =>
      `<div class="before-after">\n\n${side("前", "before-after-label", before)}\n\n` +
      '<div class="before-after-arrow" aria-hidden="true">→</div>\n\n' +
      `${side("後", "before-after-label before-after-label-after", after)}\n\n</div>`

    expect(
      reportSectionsMarkdown([section([beforeAfter])], {
        kind: "shelved",
        toolUseId: "toolu_fictional",
      }),
    ).toBe(
      fencedFigureCaptioned(
        body(
          `<img src="${reportImagePath("toolu_fictional", "架空/before.png")}" alt="前の画面: 架空の&lt;札&gt;">`,
          "```ts\nconst a = 1\n```",
        ),
        "架空の&lt;札&gt;",
      ),
    )
    expect(
      markdownOf({
        ...beforeAfter,
        title: "",
        before: { kind: "points", points: ["`a` を呼ぶ", "架空の<行>"] },
        after: { kind: "image", path: "架空/after.png" },
      }),
    ).toBe(
      fencedFigureCaptioned(
        body(
          "<ul><li><code>a</code> を呼ぶ</li><li>架空の&lt;行&gt;</li></ul>",
          '<img alt="後の画面">',
        ),
      ),
    )
  })

  it("beforeAfter の mermaid の側は mermaid のフェンスにする", () => {
    const markdown = markdownOf({
      kind: "beforeAfter",
      title: "",
      before: { kind: "mermaid", source: "stateDiagram-v2\n  [*] --> A\n" },
      after: { kind: "mermaid", source: "sequenceDiagram\n  A->>B: 架空\n" },
      fold: "",
      aside: "",
    })

    expect(markdown).toContain("```mermaid\nstateDiagram-v2\n  [*] --> A\n```")
    expect(markdown).toContain("```mermaid\nsequenceDiagram\n  A->>B: 架空\n```")
  })

  it("dimension は領域を箱に・余白を帯と値にして上から積み、前の値を矢印で添え、size が空の領域は値を置かない", () => {
    const dimension: ReportBlock = {
      kind: "dimension",
      title: "架空の寸法",
      parts: [
        { gap: "24px", before: "" },
        { name: "架空の`見出し`", size: "字 21px", before: "字 18px" },
        { gap: "26px", before: "28px" },
        { name: "架空の<本文>", size: "", before: "字 14px" },
      ],
      fold: "",
      aside: "",
    }
    const rows =
      '<div class="dimension-gap"><span class="dimension-band" aria-hidden="true"></span><span class="dimension-value">24px</span></div>' +
      '<div class="dimension-part"><span class="dimension-name">架空の<code>見出し</code></span><span class="dimension-value"><span class="dimension-before">字 18px →</span> 字 21px</span></div>' +
      '<div class="dimension-gap"><span class="dimension-band" aria-hidden="true"></span><span class="dimension-value"><span class="dimension-before">28px →</span> 26px</span></div>' +
      '<div class="dimension-part"><span class="dimension-name">架空の&lt;本文&gt;</span></div>'

    const body = `<div class="dimension">${rows}</div>`

    expect(markdownOf(dimension)).toBe(figureCaptioned(body, "架空の寸法"))
    expect(markdownOf({ ...dimension, title: "" })).toBe(figureCaptioned(body))
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
      aside: "",
    }

    const mark = (className: string, label: string, symbol: string): string =>
      `<span class="matrix-mark ${className}" role="img" aria-label="${label}">${symbol}</span>`
    expect(markdownOf(matrix)).toBe(
      tableCaptioned(
        '<div class="matrix">\n\n' +
          "|  | 列\\|A | 列B |\n| --- | :---: | :---: |\n" +
          `| 行1 | ${mark("matrix-mark-ok", "OK", "✓")} | ${mark("matrix-mark-ng", "NG", "✕")} |\n` +
          `| 行2 | ${mark("matrix-mark-na", "該当なし", "－")} | ${mark("matrix-mark-ok", "OK", "✓")} |\n\n` +
          '<div class="matrix-legend">' +
          '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-ok" aria-hidden="true">✓</span> OK</span>' +
          '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-ng" aria-hidden="true">✕</span> NG</span>' +
          '<span class="matrix-legend-item"><span class="matrix-mark matrix-mark-na" aria-hidden="true">－</span> 該当なし</span>' +
          "</div>\n\n</div>",
        "架空の対応",
      ),
    )
  })

  it("files は頭に種別ごとの合計の札を並べ、1行に1ファイルで種別の札・パス（フォルダ・ファイル名）・注記を並べる", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [
        { path: "src/架空<a>.ts", change: "modified", note: "架空の `注記`" },
        { path: "src/架空`b`.ts", change: "added", note: "" },
        { path: "src/架空c.ts", change: "deleted", note: "" },
        { path: "docs/架空d.md", change: "read", note: "" },
      ],
      title: "",
      fold: "",
      aside: "",
    }
    const badge = (symbol: string, className: string, label: string): string =>
      `<span class="file-change ${className}"><span class="file-change-symbol">${symbol}</span>${label}</span>`
    const entry = (guide: string, fullPath: string, name: string): string =>
      `<span class="file-entry"><span class="file-branch" aria-hidden="true">${guide}</span>` +
      `<code data-file-path="${fullPath}"><span class="file-path-name">${name}</span></code></span>`
    const folder = (guide: string, name: string): string =>
      `<div class="file-folder"><span class="file-branch" aria-hidden="true">${guide}</span>` +
      `<span class="file-path-folder">${name}/<wbr></span></div>`

    // パスは inline code の記法として解かず、そのまま文字にする（バッククォートを含むパスも崩さない）。
    // 追加で説明が無い行だけ「新しく作った」を補足で入れ、ほかの種別で説明が無い行は列を空にする。
    expect(markdownOf(files)).toBe(
      '<div class="files">' +
        `${folder("├── ", "src")}` +
        `<div class="file">${badge("~", "file-change-modified", "変更")}` +
        `${entry("│   ├── ", "src/架空&lt;a&gt;.ts", "架空&lt;a&gt;.ts")}` +
        '<span class="file-note">架空の <code>注記</code></span></div>' +
        `<div class="file">${badge("+", "file-change-added", "追加")}` +
        `${entry("│   ├── ", "src/架空`b`.ts", "架空`b`.ts")}` +
        '<span class="file-note file-note-empty">新しく作った</span></div>' +
        `<div class="file">${badge("-", "file-change-deleted", "削除")}` +
        `${entry("│   └── ", "src/架空c.ts", "架空c.ts")}</div>` +
        `${folder("└── ", "docs")}` +
        `<div class="file">${badge("·", "file-change-read", "読んだ")}` +
        `${entry("    └── ", "docs/架空d.md", "架空d.md")}</div>` +
        '<div class="files-summary">' +
        `${badge("+", "file-change-added", "追加 1")}` +
        `${badge("~", "file-change-modified", "変更 1")}` +
        `${badge("-", "file-change-deleted", "削除 1")}` +
        `${badge("·", "file-change-read", "読んだ 1")}` +
        "</div>" +
        "</div>",
    )
  })

  it("files に title があれば、塊の下に「図 n」の題を付けて番号を既存の図と通しで数える。title が空なら番号を数えない", () => {
    const files = (title: string): ReportBlock => ({
      kind: "files",
      items: [{ path: "a.md", change: "read", note: "" }],
      title,
      fold: "",
      aside: "",
    })
    const stats: ReportBlock = {
      kind: "stats",
      items: [{ ...statItem, value: "1", label: "架空" }],
      fold: "",
      aside: "",
    }
    const bare = markdownOf(files(""))

    expect(bare.startsWith('<div class="files">')).toBe(true)
    expect(bare).not.toContain("caption")

    const markdown = reportSectionsMarkdown(
      [section([stats, files(""), files("架空の一覧"), stats])],
      NO_IMAGES,
    )
    expect(markdown).toContain(`${bare}\n\n<div class="captioned"><div class="files">`)
    expect(markdown).toContain(`${captionRow("図", 2, "架空の一覧")}</div>`)
    expect(markdown).toContain(captionRow("図", 3))
  })

  it("files のフォルダの無いパスだけの塊は、罫もフォルダの行も出さず平らな行にする", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [{ path: "a.md", change: "read", note: "" }],
      title: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(files)).toContain(
      '<div class="file"><span class="file-change file-change-read">' +
        '<span class="file-change-symbol">·</span>読んだ</span>' +
        '<code><span class="file-path-name">a.md</span></code></div>',
    )
    expect(markdownOf(files)).not.toContain("file-branch")
  })

  it.each([
    ["言語・marks", "ts", "", true, "```ts $marks"],
    ["言語・パス・marks", "ts", "src/a.ts", true, "```ts src/a.ts $marks"],
    ["言語が空でパスだけ", "", "src/a.ts", false, "```text src/a.ts"],
    ["言語が空で marks だけ", "", "", true, "```text $marks"],
    ["言語が空でパスと marks", "", "src/a.ts", true, "```text src/a.ts $marks"],
    ["言語もパスも marks も無い", "", "", false, "```"],
  ])(
    "code の info は %s のとき、marks を符号化した 1 語を末尾に添え、言語が空でパスか marks があれば先頭を text で埋める",
    (_, language, path, withMarks, info) => {
      const marks = [{ lines: "1-2", label: "架空の印 a b" }]
      const markdown = markdownOf({
        kind: "code",
        language,
        path,
        source: "a\nb\n",
        marks: withMarks ? marks : [],
        fold: "",
        aside: "",
      })

      expect(encodeMarks(marks)).not.toMatch(/\s/)
      expect(markdown.split("\n")[0]).toBe(info.replace("$marks", encodeMarks(marks)))
    },
  )

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

  it("sequenceDiagram の mermaid には autonumber を1つだけ足し、既にあるものと別の種類は変えない", () => {
    const mermaidOf = (source: string): string =>
      markdownOf({ kind: "mermaid", title: "", source, fold: "", aside: "" })

    const numbered = fencedFigureCaptioned(
      "```mermaid\nsequenceDiagram\n  autonumber\n  A ->> B: x\n```",
    )

    expect(mermaidOf("sequenceDiagram\n  A ->> B: x")).toBe(numbered)
    expect(mermaidOf("sequenceDiagram\n  autonumber\n  A ->> B: x")).toBe(numbered)
    expect(mermaidOf("stateDiagram-v2\n  [*] --> A")).toBe(
      fencedFigureCaptioned("```mermaid\nstateDiagram-v2\n  [*] --> A\n```"),
    )
  })

  it("graph は ID を n0 から振り直し、ラベルを引用符で包んだ flowchart にして図の番号と題を付ける", () => {
    expect(
      graphMarkdown('@a (b) "c" `d` -> (架空の丸)\n架空の丸 -> {架空の分岐}: a|b', "架空の図"),
    ).toBe(
      fencedFigureCaptioned(
        [
          "```mermaid",
          "flowchart LR",
          '  n0["@a (b) #quot;c#quot; #96;d#96;"]',
          '  n1(["架空の丸"])',
          '  n2{"架空の分岐"}',
          "  n0 --> n1",
          '  n1 -->|"a|b"| n2',
          "```",
          "",
          GRAPH_SHAPE_LEGEND,
        ].join("\n"),
        "架空の図",
      ),
    )
  })

  it("graph の囲みを subgraph にして、群の外の節点を先に宣言し、群ごとに破線の枠の style を足す", () => {
    const markdown = graphMarkdown("A -> B\n[架空の群]\nB -> C\n[]\nD")

    expect(markdown).toContain(
      [
        "flowchart LR",
        '  n0["A"]',
        '  n3["D"]',
        '  subgraph g0["架空の群"]',
        '    n1["B"]',
        '    n2["C"]',
        "  end",
        "  n0 --> n1",
        "  n1 --> n2",
        "  style g0 fill:var(--surface-raised),stroke:var(--rule-quiet),stroke-width:1px,stroke-dasharray:5 4",
        "```",
      ].join("\n"),
    )
    expect(markdown).not.toContain("graph-legend")
  })

  it.each([
    ["箱だけ", "A -> B", []],
    ["箱と角丸", "(A) -> B", ["round", "box"]],
    ["群があっても形が1種", "[群]\nA -> B\n[]", []],
    ["3種", "(A) -> B\nB -> {C}", ["round", "box", "decision"]],
  ])(
    "graph の形の凡例は形が2種以上のときだけ、出た形を出す順で並べる（%s）",
    (_, source, shapes) => {
      expect(
        [...graphMarkdown(source).matchAll(/graph-legend-shape-(\w+)"/g)].map((match) => match[1]),
      ).toEqual(shapes)
    },
  )

  it("graph の形の凡例は印の凡例と同じ行に、形を先に並べる", () => {
    const markdown = graphMarkdown("(A) -> B\n+ B -> C")

    expect(markdown.match(/<div class="graph-legend">/g)).toHaveLength(1)
    expect(markdown.indexOf("graph-legend-shape-round")).toBeLessThan(
      markdown.indexOf("graph-legend-added"),
    )
  })

  it("graph の印を classDef / class / linkStyle にし、凡例は印のある図にだけ付ける", () => {
    const marked = graphMarkdown("+ A -> B\n- B -> C: 語\n~ D\n- E\nB -> D")

    expect(marked).toContain(
      [
        "  classDef added stroke:var(--state-ok),stroke-width:3px",
        "  classDef removed stroke:var(--state-ng),stroke-width:3px,stroke-dasharray:5 4",
        "  classDef changed stroke:var(--state-warn),stroke-width:3px",
        "  class n3 changed",
        "  class n4 removed",
        "  linkStyle 0 stroke:var(--state-ok),stroke-width:2px",
        "  linkStyle 1 stroke:var(--state-ng),stroke-width:2px,stroke-dasharray:5 4",
        "```",
      ].join("\n"),
    )
    expect(marked).toContain('<div class="graph-legend">')
    expect(marked).toContain("足した")
    expect(marked).toContain("消した")
    expect(marked).toContain("変えた")

    const plain = graphMarkdown("A -> B")
    expect(plain).not.toContain("classDef")
    expect(plain).not.toContain("linkStyle")
    expect(plain).not.toContain("graph-legend")
  })

  it("svg は図形から viewBox つきの1行の SVG を組み、強調の枠・矢じり・ラベルの逃がしを含めて図の番号と題を付ける", () => {
    const markdown = markdownOf({
      kind: "svg",
      title: "架空の配置",
      width: 200,
      height: 100,
      fold: "",
      aside: "",
      shapes: [
        { kind: "rect", x: 10, y: 20, width: 80, height: 40, label: "A<b>", emphasis: true },
        { kind: "rect", x: 100, y: 20, width: 80, height: 40, label: "", emphasis: false },
        { kind: "line", x1: 90, y1: 40, x2: 100, y2: 40, arrow: true, label: "" },
        { kind: "text", x: 5, y: 90, text: "架空の字" },
      ],
    })

    expect(markdown).toContain('<svg viewBox="0 0 200 100" width="200" height="100">')
    expect(markdown).toContain(
      '<rect x="10" y="20" width="80" height="40" rx="4" stroke-width="3"></rect>',
    )
    expect(markdown).toContain('<rect x="100" y="20" width="80" height="40" rx="4"></rect>')
    expect(markdown).toContain('marker-end="url(#report-svg-arrow)"')
    expect(markdown).toContain("A&lt;b&gt;</text>")
    expect(markdown).toContain('<text x="5" y="90" font-size="14">架空の字</text>')
    expect(markdown).not.toContain("\n\n<svg")
    expect(markdown).toContain(captionRow("図", 1, "架空の配置"))
  })

  it("beforeAfter の svg の側も SVG を組む", () => {
    const side = {
      kind: "svg",
      width: 50,
      height: 50,
      shapes: [{ kind: "text", x: 1, y: 2, text: "架空" }],
    } as const
    const markdown = markdownOf({
      kind: "beforeAfter",
      title: "",
      before: side,
      after: side,
      fold: "",
      aside: "",
    })

    expect(markdown.match(/<svg viewBox="0 0 50 50"/g)).toHaveLength(2)
  })

  describe("chart の設定", () => {
    const labels = ["架空A", "架空B"]
    const one = [{ name: "架空系列", values: [1, 2] }]
    const two = [
      { name: "架空系列1", values: [1, 2] },
      { name: "架空系列2", values: [3, 4] },
    ]
    const pair = [
      { name: "架空の前", values: [1, 2] },
      { name: "架空の後", values: [3, 0] },
    ]
    const direct = (mode: "arrow" | "slope") => ({
      "tsukumo-direct-label": { mode, names: ["架空の前", "架空の後"] },
    })

    it.each([
      [
        "bar",
        "bar",
        one,
        false,
        {
          type: "bar",
          data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: {},
        },
      ],
      [
        "bar の horizontal は indexAxis を y にする",
        "bar",
        one,
        true,
        {
          type: "bar",
          data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: { indexAxis: "y" },
        },
      ],
      [
        "line の horizontal は軸を変えない",
        "line",
        one,
        true,
        {
          type: "line",
          data: { labels, datasets: [{ label: "架空系列", data: [1, 2] }] },
          options: {},
        },
      ],
      [
        "line は系列ごとに1本",
        "line",
        two,
        false,
        {
          type: "line",
          data: {
            labels,
            datasets: [
              { label: "架空系列1", data: [1, 2] },
              { label: "架空系列2", data: [3, 4] },
            ],
          },
          options: {},
        },
      ],
      [
        "pie は先頭の系列だけを使う",
        "pie",
        two,
        false,
        {
          type: "pie",
          data: { labels, datasets: [{ label: "架空系列1", data: [1, 2] }] },
          options: {},
        },
      ],
      [
        "arrow は項目ごとの前→後を浮き棒にして系列名を plugin に渡す",
        "arrow",
        pair,
        false,
        {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "架空の前 → 架空の後",
                data: [
                  [1, 3],
                  [2, 0],
                ],
                barThickness: 4,
              },
            ],
          },
          options: {
            indexAxis: "y",
            scales: { y: { display: false } },
            plugins: direct("arrow"),
          },
        },
      ],
      [
        "slope は項目ごとの線にして系列名を plugin に渡す",
        "slope",
        pair,
        false,
        {
          type: "line",
          data: {
            labels: ["架空の前", "架空の後"],
            datasets: [
              { label: "架空A", data: [1, 3] },
              { label: "架空B", data: [2, 0] },
            ],
          },
          options: { scales: { y: { display: false } }, plugins: direct("slope") },
        },
      ],
    ] as const)(
      "chart の %s は Chart.js の設定を chart フェンスに JSON で書く",
      (_, chartKind, series, horizontal, config) => {
        expect(
          chartFenceOf({
            kind: "chart",
            title: "",
            chartKind,
            labels,
            series,
            horizontal,
            fold: "",
            aside: "",
          }),
        ).toBe(`\`\`\`chart\n${JSON.stringify(config)}\n\`\`\``)
      },
    )
  })

  it("image は棚を引く src の img と1行の説明を組み、説明の < は逃がす。頭に図の通し番号が付く", () => {
    const image: ReportBlock = {
      kind: "image",
      path: "架空/after.png",
      caption: "架空の<画面>",
      notes: [],
      fold: "",
      aside: "",
    }

    expect(
      reportSectionsMarkdown([section([image])], { kind: "shelved", toolUseId: "toolu_fictional" }),
    ).toBe(
      figureCaptioned(
        `<img src="${reportImagePath("toolu_fictional", "架空/after.png")}" alt="架空の&lt;画面&gt;">`,
        "架空の&lt;画面&gt;",
      ),
    )
  })

  it("image の説明が空なら alt は既定の語で説明の文字は置かず、図の番号だけ付く。棚に置いていない本文では src を付けない", () => {
    expect(
      markdownOf({ kind: "image", path: "架空.png", caption: " ", notes: [], fold: "", aside: "" }),
    ).toBe(figureCaptioned('<img alt="画面の画像">'))
  })

  it("image の notes は画像の横に1から番号を振った並びになり、< は逃がし、包みは縮めない", () => {
    const image: ReportBlock = {
      kind: "image",
      path: "架空.png",
      caption: "架空の画面",
      notes: ["左上の <帯> が伸びた", "右の `札` が消えた"],
      fold: "",
      aside: "",
    }

    expect(markdownOf(image)).toBe(
      figureCaptioned(
        '<div class="image-notes"><img alt="架空の画面"><ol class="image-note-list">' +
          '<li><span class="image-note-number" aria-hidden="true">1</span><span class="image-note-text">左上の &lt;帯&gt; が伸びた</span></li>' +
          '<li><span class="image-note-number" aria-hidden="true">2</span><span class="image-note-text">右の <code>札</code> が消えた</span></li>' +
          "</ol></div>",
        "架空の画面",
        1,
        false,
      ),
    )
  })

  it("図の6種と表の2種は別々に1から数え、題が空でも fold の中でも数え、options は数えない", () => {
    const image = (fold: string): ReportBlock => ({
      kind: "image",
      path: "架空.png",
      caption: "",
      notes: [],
      fold,
      aside: "",
    })
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [["架空の a", "1"]],
      rest: "",
      fold: "",
      aside: "",
    }
    const options: ReportBlock = {
      kind: "options",
      title: "",
      items: [
        { name: "架空の案A", verdict: "adopt", reason: "架空の理由" },
        { name: "架空の案B", verdict: "reject", reason: "架空の理由" },
      ],
      fold: "",
      aside: "",
    }
    const mermaid: ReportBlock = {
      kind: "mermaid",
      title: "",
      source: "sequenceDiagram",
      fold: "",
      aside: "",
    }
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "",
      columns: ["列A"],
      rows: [{ name: "行1", cells: ["ok"] }],
      fold: "",
      aside: "",
    }

    expect(
      captionNumbers([
        section([image(""), table, options]),
        section([image("架空の畳み"), mermaid, matrix]),
      ]),
    ).toEqual(["図 1", "表 1", "図 2", "図 3", "表 2"])
  })

  it("stats は図として数え、image・chart と通しの番号になり、fold の中でも数える", () => {
    const stats = (fold: string): ReportBlock => ({
      kind: "stats",
      items: [{ ...statItem, value: "1", label: "架空" }],
      fold,
      aside: "",
    })
    const image: ReportBlock = {
      kind: "image",
      path: "架空.png",
      caption: "",
      notes: [],
      fold: "",
      aside: "",
    }
    const chart: ReportBlock = {
      kind: "chart",
      title: "",
      chartKind: "bar",
      labels: ["a"],
      series: [{ name: "系列", values: [1] }],
      horizontal: false,
      fold: "",
      aside: "",
    }

    expect(
      captionNumbers([section([image, stats(""), chart]), section([stats("架空の畳み")])]),
    ).toEqual(["図 1", "図 2", "図 3", "図 4"])
  })

  it("fold のある塊は details に畳む", () => {
    expect(
      markdownOf({ kind: "text", text: "架空の脇道。", fold: "架空の<見出し>", aside: "" }),
    ).toBe("<details><summary>架空の&lt;見出し&gt;</summary>\n\n架空の脇道。\n\n</details>")
  })

  describe("傍注（塊の aside と memo の note）", () => {
    const memo = (value: string): ReportBlock => ({
      kind: "note",
      tone: "memo",
      text: value,
      fold: "",
      aside: "",
    })
    const asideNote = (value: string): string =>
      `<aside class="gutter-note">\n\n${value}\n\n</aside>`
    const memoNote = (value: string): string =>
      asideNote(`<span class="gutter-note-label">メモ</span>${value}`)
    const withGutter = (body: string, notes: readonly string[]): string =>
      [
        '<div class="with-gutter">',
        ...(body === "" ? [] : [body]),
        ['<div class="gutter">', ...notes, "</div>"].join("\n\n"),
        "</div>",
      ].join("\n\n")

    it("aside のある塊は包みの中で、塊のあとに傍注が出る", () => {
      expect(markdownOf({ ...text("架空の本文。"), aside: "出どころ: 架空の `a.ts:3`" })).toBe(
        withGutter("架空の本文。", [asideNote("出どころ: 架空の `a.ts:3`")]),
      )
    })

    it("memo の note は直前の塊の傍注になり、本文の位置に note-memo が残らない", () => {
      const markdown = reportSectionsMarkdown(
        [section([text("架空の本文。"), memo("架空の覚え書き。"), text("架空の次の段落。")])],
        NO_IMAGES,
      )

      expect(markdown).toBe(
        [withGutter("架空の本文。", [memoNote("架空の覚え書き。")]), "架空の次の段落。"].join(
          "\n\n",
        ),
      )
      expect(markdown).not.toContain("note-memo")
    })

    it("塊の aside と続く memo は1つの傍注の並びに、書いた順で並ぶ", () => {
      expect(
        reportSectionsMarkdown(
          [section([{ ...text("架空の本文。"), aside: "架空の出典" }, memo("架空の覚え書き。")])],
          NO_IMAGES,
        ),
      ).toBe(withGutter("架空の本文。", [asideNote("架空の出典"), memoNote("架空の覚え書き。")]))
    })

    it("節の最初の memo は塊の無い包みになり、前の節の塊には付かない", () => {
      expect(
        reportSectionsMarkdown(
          [section([text("架空の前の節。")]), section([memo("架空の覚え書き。")], "架空の見出し")],
          NO_IMAGES,
        ),
      ).toBe(
        [
          "架空の前の節。",
          '<div class="report-section-break"></div>',
          "## 架空の見出し",
          withGutter("", [memoNote("架空の覚え書き。")]),
        ].join("\n\n"),
      )
    })

    it("fold のある塊は details ごと包み、傍注は details の外に置く", () => {
      expect(markdownOf({ ...text("架空の脇道。"), fold: "架空の畳み", aside: "架空の出典" })).toBe(
        withGutter("<details><summary>架空の畳み</summary>\n\n架空の脇道。\n\n</details>", [
          asideNote("架空の出典"),
        ]),
      )
    })

    it("傍注の文字は逃がし、空白だけの aside と空の memo は傍注にしない", () => {
      expect(markdownOf({ ...text("架空の本文。"), aside: "架空の<b>出典</b>" })).toBe(
        withGutter("架空の本文。", [asideNote("架空の&lt;b>出典&lt;/b>")]),
      )
      expect(
        reportSectionsMarkdown(
          [section([{ ...text("架空の本文。"), aside: "  " }, memo(" ")])],
          NO_IMAGES,
        ),
      ).toBe("架空の本文。")
    })
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
