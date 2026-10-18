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
})
