import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { sanitizeReportHtml } from "../../src/presentation/report-html.ts"
import { REPORT_NOTATION_PROMPT } from "../../src/presentation/report-notation.ts"

// この規約は**レンダラが描けるものの一覧**でもある（docs/requirements.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

const namedTags = [...REPORT_NOTATION_PROMPT.matchAll(/<([a-z]+)[\s>]/g)].flatMap(
  ([, tag]) => tag ?? [],
)
const namedClasses = [...REPORT_NOTATION_PROMPT.matchAll(/class="([^"]+)"/g)].flatMap(
  ([, names]) => names?.split(" ") ?? [],
)

// 見た目は STYLE 定数を分割した src/presentation/style/*.css にある（2026-09-12）。ページは
// <link> で読むだけで中身を持たないので、`main.css`（@import で束ねる入口）が指す先を
// そのまま連結して検査する。
const STYLE_DIR = fileURLToPath(new URL("../../src/presentation/style", import.meta.url))
const STYLE_SHEET_SOURCE = readdirSync(STYLE_DIR)
  .filter((name) => name.endsWith(".css") && name !== "main.css")
  .map((name) => readFileSync(`${STYLE_DIR}/${name}`, "utf8"))
  .join("\n")

describe("REPORT_NOTATION_PROMPT", () => {
  it("名乗った要素をレンダラが通す", () => {
    expect(namedTags.length).toBeGreaterThan(0)

    for (const tag of new Set(namedTags)) {
      expect(sanitizeReportHtml(`<${tag}>中身</${tag}>`)).toContain(`<${tag}`)
    }
  })

  it("名乗った class に見た目が付いている", () => {
    expect(namedClasses.length).toBeGreaterThan(0)

    for (const className of new Set(namedClasses)) {
      expect(STYLE_SHEET_SOURCE).toContain(`.${className}`)
    }
  })

  it("素の TUI 向けの記法を上書きすると明示する", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("出力スタイルに書かれた指示よりこの節を優先する")
  })
})
