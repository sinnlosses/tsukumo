import { afterEach, describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"

import { NotationBlock } from "../../../src/browser/features/main-view/markdown/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../../src/browser/features/main-view/markdown/sanitize-schema.ts"
import { REPORT_NOTATION_PROMPT } from "../../../src/server/core/report-notation.ts"

afterEach(() => {
  cleanup()
})

// この規約は**レンダラが描けるものの一覧**でもある（docs/requirements.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

/**
 * tsukumo が配る mermaid（package.json で 12.0.0 に固定）で**実際に描けることを目視で確かめた種類**
 * （11.15.0 と 12.0.0 の両方で確かめた。docs/requirements.md 4.2）。規約が勧めてよいのはこの並びだけで、**増やすときは
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

// 見た目はレポートを描く機能の CSS（`main-view.module.css`）にある。**テストの中では class 名が
// CSS に書いた綴りのまま届く**（test/css-module-loader.ts）ので、部品が付け直した名前を
// そのファイルの選択子とそのまま突き合わせられる。
const STYLE_SHEET_SOURCE = readFileSync(
  fileURLToPath(
    new URL("../../../src/browser/features/main-view/main-view.module.css", import.meta.url),
  ),
  "utf8",
)

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

  it("note の6種を名乗り、どれも部品がラベルを出し、その先に見た目が付いている", () => {
    // 規約（モデルが書く名前）→ 部品（ラベルの文字）→ CSS の鎖を6種ぶん見る。**種別の文字を
    // 出すのは tsukumo 側**（docs/design.md 13.1 原則5）なので、印だけ足してラベルを足し忘れる
    // と、素の note と同じ「何の塊か読み取れない」状態に戻る。
    const kinds = [
      ["note", "情報"],
      ["note-warn", "注意"],
      ["note-ng", "異常"],
      ["note-ask", "疑問"],
      ["note-memo", "メモ"],
      ["note-favor", "お願い"],
    ] as const

    for (const [name, label] of kinds) {
      expect(REPORT_NOTATION_PROMPT).toContain(name)

      const { container } = render(
        createElement(NotationBlock, { className: `note ${name}` }, "架空の本文。"),
      )
      const element = container.firstElementChild

      expect(element?.textContent).toBe(`${label}架空の本文。`)
      for (const resolved of element?.className.split(" ") ?? []) {
        expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
      }
    }
  })

  it("note の上限は種別ごとではなく全体で持つ（6種を1つずつ置けてしまわない）", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("5種あわせて1つのレポートに1〜2個まで")
    // 種別の語は tsukumo がラベルとして描くので、本文に書かせない。
    expect(REPORT_NOTATION_PROMPT).toContain("ラベルの文字は tsukumo が付ける")
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

  it("表には見出しを付けさせ、その中身をセルに無いことへ絞る", () => {
    // 条3（同じことを二度言わない）とのぶつかりを、見出しに書いてよい中身を絞って畳んだ決定
    // （docs/requirements.md 4.2）。絞りを落とすと、見出しが表の言い直しになる。
    expect(REPORT_NOTATION_PROMPT).toContain("表には直前の1行で見出しを付ける")
    expect(REPORT_NOTATION_PROMPT).toContain("セルに無いこと")
  })

  it("表のセルの中にフェンスを書かせない", () => {
    // セルでは開始フェンスにならず、閉じの無い inline code として素の文字が残る
    // （実際に崩した）。禁じるだけでなく、言い換え先（inline code）まで書かせる。
    expect(REPORT_NOTATION_PROMPT).toContain("表のセルの中にフェンスを書かない")
    expect(REPORT_NOTATION_PROMPT).toContain("inline code にする")
  })

  it("図にするかの判定は、下書きの上で数えられる形で書く", () => {
    // 「関係が2つ以上」は数えられず、同じ表の「項目が2つ以上」に負けていた（docs/requirements.md 4.2）。
    expect(REPORT_NOTATION_PROMPT).toContain("名前が3つ以上出てきて")
    expect(REPORT_NOTATION_PROMPT).not.toContain("関係が2つ以上")
    expect(REPORT_NOTATION_PROMPT).toContain("迷ったら flowchart")
  })

  it("印を勧めることが、書く量を増やす言い訳にならない", () => {
    // 「まず量を絞り、残ったものに構造を付ける」と噛み合わせるための条項。
    expect(REPORT_NOTATION_PROMPT).toContain(
      "構造を付けられることは、書く量を増やしてよい理由に\nならない",
    )
    expect(REPORT_NOTATION_PROMPT).toContain("印は文の代わりに置くもので、文への足し算ではない")
  })
})
