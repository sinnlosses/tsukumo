import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { REPORT_NOTATION_PROMPT } from "../../src/core/report-notation.ts"
import { REPORT_SANITIZE_SCHEMA } from "../../src/ui/features/main-view/markdown/sanitize-schema.ts"

// この規約は**レンダラが描けるものの一覧**でもある（docs/requirements.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

const namedTags = [...REPORT_NOTATION_PROMPT.matchAll(/<([a-z]+)[\s>]/g)].flatMap(
  ([, tag]) => tag ?? [],
)
const namedClasses = [...REPORT_NOTATION_PROMPT.matchAll(/class="([^"]+)"/g)].flatMap(
  ([, names]) => names?.split(" ") ?? [],
)

// 見た目は src/ui/styles/*.css にある（移行の段6で src/presentation/style/ から移った）。
// ページは <link> で読むだけで中身を持たないので、main.css（@import で束ねる入口）が指す先を
// そのまま連結して検査する。
const STYLE_DIR = fileURLToPath(new URL("../../src/ui/styles", import.meta.url))
const STYLE_SHEET_SOURCE = readdirSync(STYLE_DIR)
  .filter((name) => name.endsWith(".css") && name !== "main.css")
  .map((name) => readFileSync(`${STYLE_DIR}/${name}`, "utf8"))
  .join("\n")

describe("REPORT_NOTATION_PROMPT", () => {
  it("名乗った要素を rehype-sanitize の schema が通す", () => {
    expect(namedTags.length).toBeGreaterThan(0)

    const allowed = REPORT_SANITIZE_SCHEMA.tagNames ?? []
    for (const tag of new Set(namedTags)) {
      expect(allowed).toContain(tag)
    }
  })

  it("名乗った class に見た目が付いている", () => {
    expect(namedClasses.length).toBeGreaterThan(0)

    for (const className of new Set(namedClasses)) {
      expect(STYLE_SHEET_SOURCE).toContain(`.${className}`)
    }
  })

  it("出力スタイルとキャラクターの人格の両方を上書きすると明示する", () => {
    expect(REPORT_NOTATION_PROMPT).toContain(
      "出力スタイルやキャラクターの人格に書かれた指示よりこの節を優先する",
    )
  })

  it("レポートの文体は中立と決めている（キャラクターの口調はセリフが担う）", () => {
    // どのパックに切り替えても本文の読みやすさが変わらないようにするための決定
    // （docs/requirements.md 4.2）。文体を persona.md 側に持たせない。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは中立の文体で書く")
  })

  it("「描けない」記法は無い（移行の段6で unified に置き換えたため）", () => {
    expect(REPORT_NOTATION_PROMPT).not.toContain("描けない")
  })
})
