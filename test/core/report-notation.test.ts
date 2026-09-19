import { afterEach, describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"

import { REPORT_NOTATION_PROMPT } from "../../src/core/report-notation.ts"
import { NotationBlock } from "../../src/ui/features/main-view/markdown/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../src/ui/features/main-view/markdown/sanitize-schema.ts"

afterEach(() => {
  cleanup()
})

// この規約は**レンダラが描けるものの一覧**でもある（docs/requirements.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

/**
 * 同梱の mermaid（`vendor/mermaid.min.js` 11.15.0）で**実際に描けることを目視で確かめた種類**
 * （2026-09-17。docs/requirements.md 4.2）。規約が勧めてよいのはこの並びだけで、**増やすときは
 * 先にメインビューへ出して描けることを確かめる**。
 */
const DRAWN_MERMAID_KINDS = [
  "flowchart",
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
  "erDiagram",
  "mindmap",
  "timeline",
  "gantt",
  "gitGraph",
  "quadrantChart",
]

/**
 * 同じ場で**構文が通らなかった**種類と、`chart` のフェンスと用途が重なるので載せない種類。
 * 規約に紛れ込んでいないかを見る。
 */
const KINDS_NOT_TO_OFFER = ["sankey", "architecture", "requirementDiagram", "journey", "xychart"]

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

  it("名乗った class が部品に解決され、その先に見た目が付いている", () => {
    // 規約 → 部品（`notation.tsx`）→ CSS の鎖をひと続きで見る。CSS が受けるのはモデルが
    // 書いた名前ではなく部品が付け直した名前なので、**実際に描いてから**その class を CSS に
    // 突き合わせる（片方だけ足したときにここで落ちる）。
    expect(namedClasses.length).toBeGreaterThan(0)

    for (const className of new Set(namedClasses)) {
      const { container } = render(createElement(NotationBlock, { className }, "中身"))
      const element = container.firstElementChild

      expect(element?.className).not.toBe(className)
      for (const resolved of element?.className.split(" ") ?? []) {
        expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
      }
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

  it("勧める mermaid の種類は、描けることを確かめたものだけ", () => {
    for (const kind of DRAWN_MERMAID_KINDS) {
      expect(REPORT_NOTATION_PROMPT).toContain(kind)
    }
    for (const kind of KINDS_NOT_TO_OFFER) {
      expect(REPORT_NOTATION_PROMPT).not.toContain(kind)
    }
    expect(REPORT_NOTATION_PROMPT).toContain(`${String(DRAWN_MERMAID_KINDS.length)}種`)
  })

  it("印の使いどころは「文へ倒す条件」ではなく用途で書く", () => {
    // 3列目を「迷ったときの判断」から「使う目安」へ反転させた決定（docs/requirements.md 4.2）。
    // 下限（「3行以上あるときだけ」）を各行に並べると、印を使える内容まで文のまま残る。
    expect(REPORT_NOTATION_PROMPT).toContain("| 内容 | 使う印 | 使う目安 |")
    expect(REPORT_NOTATION_PROMPT).not.toContain("迷ったときの判断")
    expect(REPORT_NOTATION_PROMPT).toContain("文のままでよいのは次のときだけ")
  })

  it("印を勧めることが、書く量を増やす言い訳にならない", () => {
    // 2026-09-15 の「まず量を絞り、残ったものに構造を付ける」と噛み合わせるための条項。
    expect(REPORT_NOTATION_PROMPT).toContain(
      "構造を付けられることは、書く量を増やしてよい理由に\nならない",
    )
    expect(REPORT_NOTATION_PROMPT).toContain("印は文の代わりに置くもので、文への足し算ではない")
  })
})
