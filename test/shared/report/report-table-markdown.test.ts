import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { markdownOf, tableCaptioned } from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
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
})
