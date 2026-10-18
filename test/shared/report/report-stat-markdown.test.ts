import { describe, expect, it } from "vitest"

import {
  type StatItem,
  markdownOf,
  statItem,
  statsCaptioned,
} from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
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
})
