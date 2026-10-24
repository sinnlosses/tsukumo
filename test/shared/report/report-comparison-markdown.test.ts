import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { reportImagePath } from "../../../src/shared/report/report-image.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"
import {
  fencedFigureCaptioned,
  figureCaptioned,
  markdownOf,
  section,
} from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
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
        sizes: [],
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

  it("beforeAfter の画像の側は region があるときだけ data-change-region を付ける", () => {
    const beforeAfter: ReportBlock = {
      kind: "beforeAfter",
      title: "",
      before: { kind: "image", path: "架空/before.png" },
      after: {
        kind: "image",
        path: "架空/after.png",
        region: { left: 29.6, top: 44.6, width: 40.5, height: 10.6 },
      },
      fold: "",
      aside: "",
    }

    const markdown = markdownOf(beforeAfter)

    expect(markdown).toContain('alt="後の画面" data-change-region="29.6,44.6,40.5,10.6">')
    expect(markdown).toContain('alt="前の画面">')
    expect(markdown.match(/data-change-region/g)).toHaveLength(1)
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
})
