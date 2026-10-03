import { describe, expect, it } from "vitest"

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
const text = (value: string): ReportBlock => ({ kind: "text", text: value, fold: "" })
const captionRow = (label: "図" | "表", ordinal: number, title = ""): string =>
  `<div class="caption"><span class="caption-number">${label} ${String(ordinal)}</span>` +
  `${title === "" ? "" : `<span class="caption-text">${title}</span>`}</div>`
/** 図の包み。本体が HTML だけなら空行を挟まず、題の行は本体のあと。 */
const figureCaptioned = (body: string, title = "", ordinal = 1, fit = true): string =>
  `<div class="captioned${fit ? " captioned-fit" : ""}">${body}${captionRow("図", ordinal, title)}</div>`
/** 図の包み（本体が Markdown のフェンスで、空行で区切る）。 */
const fencedFigureCaptioned = (body: string, title = "", ordinal = 1): string =>
  `<div class="captioned">\n\n${body}\n\n${captionRow("図", ordinal, title)}\n\n</div>`
/** 図の包みから、本体のフェンスだけを取り出す。 */
const chartFenceOf = (block: ReportBlock): string =>
  markdownOf(block)
    .replace(/^<div class="captioned">\n\n/, "")
    .replace(/\n\n<div class="caption">.*<\/div>\n\n<\/div>$/, "")
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
      section([{ kind: "markdown", markdown: "", fold: "" }], ""),
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

  it("表は番号つきの題の行のあとに GFM の表で組み、状態のセルは記号と文を1行に並べたタイルにし、下に出た状態だけの凡例を添える（記号は role=img の aria-label で状態語を読み上げる）", () => {
    const table: ReportBlock = {
      kind: "table",
      title: "架空の表",
      columns: ["項目", "結果", "備考"],
      rows: [
        ["架空の a|b", { status: "ok", text: "通過" }, "架空の備考"],
        ["架空の c", { status: "ng", text: "NG" }, "架空の備考"],
        ["架空の d", "架空の同じ", "架空の備考"],
      ],
      fold: "",
    }

    expect(markdownOf(table)).toBe(
      tableCaptioned(
        [
          "| 項目 | 結果 | 備考 |",
          "| --- | --- | --- |",
          '| 架空の a\\|b | <span class="cell-status cell-status-ok"><span class="cell-status-mark cell-status-ok" role="img" aria-label="OK">✓</span><span class="cell-status-text">通過</span></span> | 架空の備考 |',
          '| 架空の c | <span class="cell-status cell-status-ng"><span class="cell-status-mark cell-status-ng" role="img" aria-label="NG">✕</span><span class="cell-status-text">NG</span></span> | 架空の備考 |',
          '| 架空の d | <span class="cell-status-none">架空の同じ</span> | 架空の備考 |',
          "",
          '<div class="table-status-legend"><span class="table-status-legend-item"><span class="table-status-legend-swatch cell-status-ok" aria-hidden="true"></span><span class="cell-status-mark cell-status-ok" aria-hidden="true">✓</span> OK</span><span class="table-status-legend-item"><span class="table-status-legend-swatch cell-status-ng" aria-hidden="true"></span><span class="cell-status-mark cell-status-ng" aria-hidden="true">✕</span> NG</span></div>',
        ].join("\n"),
        "架空の表",
      ),
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
      tableCaptioned(
        [
          "| 項目 | 件数 | 割合 |",
          "| --- | ---: | --- |",
          "| 架空の a | 312 | 12.5% |",
          "| 架空の b | -8 | 架空の8件 |",
        ].join("\n"),
      ),
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
      tableCaptioned(
        [
          "| 項目 | 件数 |",
          "| --- | ---: |",
          '| 架空の a | <span class="cell-numeric"><span class="cell-bar" style="width: 100%"></span><span class="cell-numeric-value">40</span></span> |',
          '| 架空の b | <span class="cell-numeric"><span class="cell-bar" style="width: 25%"></span><span class="cell-numeric-value">10</span></span> |',
        ].join("\n"),
      ),
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
      tableCaptioned(["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 40 |"].join("\n")),
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
      tableCaptioned(
        ["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 312 |", "| 架空の b | -8 |"].join("\n"),
      ),
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
      tableCaptioned(
        ["| 項目 | 件数 |", "| --- | ---: |", "| 架空の a | 0 |", "| 架空の b | 0 |"].join("\n"),
      ),
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
      tableCaptioned(
        [
          "| 項目 | 件数 |",
          "| --- | ---: |",
          '| 架空の a | <span class="change-from">12 →</span> 8 |',
          "| 架空の b | 3 |",
        ].join("\n"),
      ),
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

  it("flow は番号の丸と線でつないだ ol/li で組み、名前があれば本文の頭に太字で添える", () => {
    const items = [
      { label: "", text: "架空の `入口`", done: false },
      { label: "架空の段", text: "架空の<中>", done: true },
      { label: "", text: "架空の出口", done: false },
    ]

    expect(markdownOf({ kind: "list", style: "flow", items, fold: "" })).toBe(
      '<ol class="flow" aria-label="流れ">' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">1</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span>架空の <code>入口</code></span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">2</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span><b>架空の段</b>架空の&lt;中&gt;</span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">3</span>' +
        "<span>架空の出口</span></li></ol>",
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

  it("compare は2つの側を見出しと箇条の札にし、題の行を本体の下に置く（title が空なら番号だけ）", () => {
    const compare: ReportBlock = {
      kind: "compare",
      title: "架空の見比べ",
      sides: [
        { heading: "変更前", points: ["`a` を呼ぶ", "架空の<行>"] },
        { heading: "変更後", points: ["架空の1行"] },
      ],
      fold: "",
    }
    const sides =
      '<div class="compare-side"><div class="compare-heading">変更前</div><ul><li><code>a</code> を呼ぶ</li><li>架空の&lt;行&gt;</li></ul></div>' +
      '<div class="compare-side"><div class="compare-heading">変更後</div><ul><li>架空の1行</li></ul></div>'

    const body = `<div class="compare">${sides}</div>`

    expect(markdownOf(compare)).toBe(figureCaptioned(body, "架空の見比べ", 1, false))
    expect(markdownOf({ ...compare, title: "" })).toBe(figureCaptioned(body, "", 1, false))
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
      fold: "",
    }
    const badge = (symbol: string, className: string, label: string): string =>
      `<span class="file-change ${className}"><span class="file-change-symbol">${symbol}</span>${label}</span>`
    const path = (folder: string, name: string): string =>
      `<code><span class="file-path-folder">${folder}/<wbr></span>` +
      `<span class="file-path-name">${name}</span></code>`

    // パスは inline code の記法として解かず、そのまま文字にする（バッククォートを含むパスも崩さない）。
    // 追加で説明が無い行だけ「新しく作った」を補足で入れ、ほかの種別で説明が無い行は列を空にする。
    expect(markdownOf(files)).toBe(
      '<div class="files">' +
        '<div class="files-summary">' +
        `${badge("+", "file-change-added", "追加 1")}` +
        `${badge("~", "file-change-modified", "変更 1")}` +
        `${badge("-", "file-change-deleted", "削除 1")}` +
        `${badge("·", "file-change-read", "読んだ 1")}` +
        "</div>" +
        `<div class="file">${badge("~", "file-change-modified", "変更")}` +
        `${path("src", "架空&lt;a&gt;.ts")}` +
        '<span class="file-note">架空の <code>注記</code></span></div>' +
        `<div class="file">${badge("+", "file-change-added", "追加")}` +
        `${path("src", "架空`b`.ts")}` +
        '<span class="file-note file-note-empty">新しく作った</span></div>' +
        `<div class="file">${badge("-", "file-change-deleted", "削除")}` +
        `${path("src", "架空c.ts")}</div>` +
        `<div class="file">${badge("·", "file-change-read", "読んだ")}` +
        `${path("docs", "架空d.md")}</div>` +
        "</div>",
    )
  })

  it("files のパスは頭の「/」も含めてフォルダに残し、どの「/」の後でも折り返せる", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [{ path: "/架空/a.md", change: "read", note: "" }],
      fold: "",
    }

    expect(markdownOf(files)).toContain(
      '<code><span class="file-path-folder">/<wbr>架空/<wbr></span><span class="file-path-name">a.md</span></code>',
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
    expect(
      markdownOf({
        kind: "mermaid",
        title: "架空の図",
        source: "flowchart LR\n  A --> B",
        fold: "",
      }),
    ).toBe(fencedFigureCaptioned("```mermaid\nflowchart LR\n  A --> B\n```", "架空の図"))
  })

  it("chart は Chart.js の設定を組んで chart フェンスに JSON で書く。pie は先頭の系列だけを使う", () => {
    expect(
      chartFenceOf({
        kind: "chart",
        title: "",
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
      chartFenceOf({
        kind: "chart",
        title: "",
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
      chartFenceOf({
        kind: "chart",
        title: "",
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
      chartFenceOf({
        kind: "chart",
        title: "",
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

  it("image は棚を引く src の img と1行の説明を組み、説明の < は逃がす。頭に図の通し番号が付く", () => {
    const image: ReportBlock = {
      kind: "image",
      path: "架空/after.png",
      caption: "架空の<画面>",
      fold: "",
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
    expect(markdownOf({ kind: "image", path: "架空.png", caption: " ", fold: "" })).toBe(
      figureCaptioned('<img alt="画面の画像">'),
    )
  })

  it("image の塊が2つ並ぶと図の番号は1から通して数える", () => {
    const first: ReportBlock = {
      kind: "image",
      path: "架空1.png",
      caption: "架空の1枚目",
      fold: "",
    }
    const second: ReportBlock = {
      kind: "image",
      path: "架空2.png",
      caption: "架空の2枚目",
      fold: "",
    }

    const markdown = reportSectionsMarkdown([section([first]), section([second])], NO_IMAGES)

    expect(markdown).toContain('<span class="caption-number">図 1</span>')
    expect(markdown).toContain('<span class="caption-number">図 2</span>')
  })

  it("図の5種と表の2種は別々に1から数え、題が空でも fold の中でも数え、options は数えない", () => {
    const image = (fold: string): ReportBlock => ({
      kind: "image",
      path: "架空.png",
      caption: "",
      fold,
    })
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [["架空の a", "1"]],
      fold: "",
    }
    const options: ReportBlock = {
      kind: "options",
      title: "",
      items: [
        { name: "架空の案A", verdict: "adopt", reason: "架空の理由" },
        { name: "架空の案B", verdict: "reject", reason: "架空の理由" },
      ],
      fold: "",
    }
    const mermaid: ReportBlock = { kind: "mermaid", title: "", source: "flowchart LR", fold: "" }
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "",
      columns: ["列A"],
      rows: [{ name: "行1", cells: ["ok"] }],
      fold: "",
    }

    const markdown = reportSectionsMarkdown(
      [section([image(""), table, options]), section([image("架空の畳み"), mermaid, matrix])],
      NO_IMAGES,
    )

    expect(
      [...markdown.matchAll(/class="caption-number">([^<]+)</g)].map(([, label]) => label),
    ).toEqual(["図 1", "表 1", "図 2", "図 3", "表 2"])
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
