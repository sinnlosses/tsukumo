import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { markdownOf } from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
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

  const cardsOf = (items: { label: string; text: string }[]): string =>
    markdownOf({
      kind: "list",
      style: "cards",
      items: items.map((item) => ({ ...item, done: false })),
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

  const flowOf = (items: { label: string; text: string }[]): string =>
    markdownOf({
      kind: "list",
      style: "flow",
      items: items.map((item) => ({ ...item, done: false })),
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

  it("claims は1項目1行の div で、確度の記号と語・主張・根拠・確かめ方を Markdown の行内として段落に置き、空の根拠と確かめ方は欄ごと出さない", () => {
    const claims: ReportBlock = {
      kind: "claims",
      items: [
        {
          claim: "架空の主張A",
          certainty: "confirmed",
          basis: "`src/架空.ts:12`",
          howToVerify: "",
        },
        {
          claim: "架空の主張B",
          certainty: "inferred",
          basis: "[example.com](https://example.com/dummy)",
          howToVerify: "架空の画面を開いて見る",
        },
        {
          claim: "架空の<主張C>",
          certainty: "unverified",
          basis: "",
          howToVerify: "架空の確かめ方",
        },
      ],
      fold: "",
      aside: "",
    }

    expect(markdownOf(claims)).toBe(
      [
        '<div class="claims">',
        '<div class="claim claim-confirmed">',
        '<span class="claim-certainty"><span class="claim-mark" aria-hidden="true">✓</span>確定</span>' +
          '<span class="claim-text">架空の主張A</span>' +
          '<span class="claim-basis"><span class="claim-field">根拠</span>`src/架空.ts:12`</span>',
        "</div>",
        '<div class="claim claim-inferred">',
        '<span class="claim-certainty"><span class="claim-mark" aria-hidden="true">〜</span>推測</span>' +
          '<span class="claim-text">架空の主張B</span>' +
          '<span class="claim-basis"><span class="claim-field">根拠</span>[example.com](https://example.com/dummy)</span>' +
          '<span class="claim-how"><span class="claim-field">確かめ方</span>架空の画面を開いて見る</span>',
        "</div>",
        '<div class="claim claim-unverified">',
        '<span class="claim-certainty"><span class="claim-mark" aria-hidden="true">？</span>未確認</span>' +
          '<span class="claim-text">架空の&lt;主張C></span>' +
          '<span class="claim-how"><span class="claim-field">確かめ方</span>架空の確かめ方</span>',
        "</div>",
        "</div>",
      ].join("\n\n"),
    )
  })
})
