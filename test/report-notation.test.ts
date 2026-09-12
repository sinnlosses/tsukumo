import { describe, expect, it } from "bun:test"

import { sanitizeReportHtml } from "../src/report-html.ts"
import { REPORT_NOTATION_PROMPT } from "../src/report-notation.ts"
import { buildLayoutPage } from "../src/view.ts"

// この規約は**レンダラが描けるものの一覧**でもある（docs/requirements.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

const namedTags = [...REPORT_NOTATION_PROMPT.matchAll(/<([a-z]+)[\s>]/g)].flatMap(
  ([, tag]) => tag ?? [],
)
const namedClasses = [...REPORT_NOTATION_PROMPT.matchAll(/class="([^"]+)"/g)].flatMap(
  ([, names]) => names?.split(" ") ?? [],
)

describe("REPORT_NOTATION_PROMPT", () => {
  it("名乗った要素をレンダラが通す", () => {
    expect(namedTags.length).toBeGreaterThan(0)

    for (const tag of new Set(namedTags)) {
      expect(sanitizeReportHtml(`<${tag}>中身</${tag}>`)).toContain(`<${tag}`)
    }
  })

  it("名乗った class に見た目が付いている", () => {
    expect(namedClasses.length).toBeGreaterThan(0)

    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
    for (const className of new Set(namedClasses)) {
      expect(page).toContain(`.${className}`)
    }
  })

  it("素の TUI 向けの記法を上書きすると明示する", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("出力スタイルに書かれた指示よりこの節を優先する")
  })
})
