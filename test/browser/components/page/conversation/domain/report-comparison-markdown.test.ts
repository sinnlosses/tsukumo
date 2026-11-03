import { describe, expect, it } from "vitest"

import type { FigureBlock } from "../../../../../../src/shared/report/report-block.ts"
import { figureCaptioned, markdownOf } from "../../../../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
  it("compare は2つの側を見出しと箇条の札にし、題の行を本体の下に置く（title が空なら番号だけ）", () => {
    const compare: FigureBlock = {
      kind: "compare",
      title: "架空の見比べ",
      relation: "versus",
      sides: [
        { kind: "points", heading: "変更前", points: ["`a` を呼ぶ", "架空の<行>"] },
        { kind: "points", heading: "変更後", points: ["架空の1行"] },
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
})
