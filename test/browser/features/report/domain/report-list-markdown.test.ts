import { describe, expect, it } from "vitest"

import { markdownOf } from "../../../../fixture/report-markdown.ts"

const NO_DETAIL = { source: "", branch: "", branchTone: "warn" } as const

describe("reportSectionsMarkdown", () => {
  it("箇条書き・番号付き・チェックリストを組む", () => {
    const items = [
      { label: "", text: "架空の一", done: true, ...NO_DETAIL },
      { label: "", text: "架空の二", done: false, ...NO_DETAIL },
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

  it("名前のある並びは印を保ったまま名前と説明を span に分けて容れ物で包み、名前の無い項目も同じ形にする", () => {
    const items = [
      { label: "架空の名前", text: "架空の **説明**", done: true, ...NO_DETAIL },
      { label: "", text: "架空の説明だけ", done: false, ...NO_DETAIL },
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

  const cardsOf = (items: { label: string; text: string }[]): string =>
    markdownOf({
      kind: "list",
      style: "cards",
      items: items.map((item) => ({ ...item, done: false, ...NO_DETAIL })),
      fold: "",
      aside: "",
    })

  it("cards は項目数ぶんの card を cards の容れ物に並べ、題を太字の1行、本文をその次の段落にする", () => {
    expect(
      cardsOf([
        { label: "架空の題一", text: "架空の `説明` 一" },
        { label: "架空の題二", text: "架空の説明二" },
      ]),
    ).toBe(
      [
        '<div class="cards">',
        "",
        '<div class="card">',
        "",
        "**架空の題一**",
        "",
        "架空の `説明` 一",
        "",
        "</div>",
        "",
        '<div class="card">',
        "",
        "**架空の題二**",
        "",
        "架空の説明二",
        "",
        "</div>",
        "",
        "</div>",
      ].join("\n"),
    )
  })

  it("cards は3項目・4項目でも題と本文が全部出力に残る", () => {
    const items = ["一", "二", "三", "四"].map((name) => ({
      label: `架空の題${name}`,
      text: `架空の本文${name}`,
    }))

    for (const count of [3, 4]) {
      const html = cardsOf(items.slice(0, count))
      expect(html.match(/<div class="card">/g)).toHaveLength(count)
      for (const { label, text } of items.slice(0, count)) {
        expect(html).toContain(`**${label}**`)
        expect(html).toContain(text)
      }
    }
  })

  type FlowItem = {
    label: string
    text: string
    source?: string
    branch?: string
    branchTone?: "ok" | "warn" | "ng"
  }
  const flowOf = (items: FlowItem[], style: "flow" | "bullet" | "cards" = "flow"): string =>
    markdownOf({
      kind: "list",
      style,
      items: items.map((item) => ({ done: false, ...NO_DETAIL, ...item })),
      fold: "",
      aside: "",
    })

  it("flow は番号の丸と線でつないだ ol/li で組み、名前があれば本文の頭に太字で添える", () => {
    const long = "あ".repeat(51)

    expect(
      flowOf([
        { label: "", text: "架空の `入口`" },
        { label: "架空の段", text: "架空の<中>" },
        { label: "", text: long },
      ]),
    ).toBe(
      '<ol class="flow" aria-label="流れ">' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">1</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span>架空の <code>入口</code></span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">2</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span><b>架空の段</b>架空の&lt;中&gt;</span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">3</span>' +
        `<span>${long}</span></li></ol>`,
    )
  })

  it("flow は5段以下で各段が50字以内なら flow-row にし、最後以外の段に矢印を付ける", () => {
    const fifty = "あ".repeat(50)

    expect(
      flowOf([
        { label: "架空の段", text: "架空の<中>" },
        { label: "", text: fifty },
      ]),
    ).toBe(
      '<ol class="flow flow-row" aria-label="流れ">' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">1</span>' +
        '<span class="flow-rail" aria-hidden="true"></span><span><b>架空の段</b>架空の&lt;中&gt;</span>' +
        '<span class="flow-arrow" aria-hidden="true">→</span></li>' +
        '<li class="flow-step"><span class="flow-number" aria-hidden="true">2</span>' +
        `<span>${fifty}</span></li></ol>`,
    )
    expect(flowOf([{ label: "", text: "架空の一段" }])).not.toContain("flow-arrow")
    expect(flowOf(Array.from({ length: 5 }, () => ({ label: "", text: "短い" })))).toContain(
      "flow-row",
    )
  })

  it("flow は6段・51字の段・名前込みで51字になる段のいずれかで縦のまま", () => {
    const short = { label: "", text: "短い" }

    expect(flowOf(Array.from({ length: 6 }, () => short))).not.toContain("flow-row")
    expect(flowOf([short, { label: "", text: "あ".repeat(51) }])).not.toContain("flow-row")
    expect(flowOf([short, { label: "あ".repeat(10), text: "い".repeat(41) }])).not.toContain(
      "flow-row",
    )
  })

  it("flow の3欄が空なら足す前と同じ出力で、source ありは flow-detailed になり flow-row は付かない", () => {
    const plain = flowOf([{ label: "", text: "架空の一段" }])
    expect(plain).toBe(flowOf([{ label: "", text: "架空の一段", source: "", branch: "" }]))
    expect(plain).not.toContain("flow-source")
    expect(plain).not.toContain("flow-detailed")

    const html = flowOf([
      { label: "架空の段", text: "短い", source: "`src/a.ts`" },
      { label: "", text: "短い" },
    ])
    expect(html).toContain('<ol class="flow flow-detailed"')
    expect(html).toContain('<span class="flow-source"><code>src/a.ts</code></span>')
    expect(html).not.toContain("flow-row")
    expect(html).not.toContain("flow-arrow")
  })

  it("flow の branch は branchTone の3値がそれぞれ class に残り、文は inline を通す", () => {
    for (const tone of ["ok", "warn", "ng"] as const) {
      const html = flowOf([
        { label: "", text: "架空", branch: "違反あり → `差し戻し`", branchTone: tone },
      ])
      expect(html).toContain(
        `<span class="flow-branch flow-branch-${tone}">違反あり → <code>差し戻し</code></span>`,
      )
    }
    expect(flowOf([{ label: "", text: "架空", branch: "分岐" }])).toContain("flow-branch-warn")
  })

  it("source・branch は flow 以外の style では出力に出ない", () => {
    for (const style of ["bullet", "cards"] as const) {
      const html = flowOf(
        [{ label: "題", text: "架空", source: "出どころ", branch: "分岐" }],
        style,
      )
      expect(html).not.toContain("出どころ")
      expect(html).not.toContain("分岐")
    }
  })
})
