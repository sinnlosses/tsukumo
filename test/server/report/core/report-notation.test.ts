import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { NotationBlock } from "../../../../src/browser/components/page/conversation/components/main-view/markdown/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../../../src/browser/components/page/conversation/components/main-view/markdown/sanitize-schema.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { REPORT_MERMAID_KINDS } from "../../../../src/shared/report-block.ts"
import {
  REPORT_BLOCK_MARK_NAMES,
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
  REPORT_NOTE_KINDS,
  REPORT_WRITTEN_MARK_NAMES,
} from "../../../../src/shared/report-notation.ts"

afterEach(() => {
  cleanup()
})

// この規約はレンダラが描けるものの一覧でもある（docs/display.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

/**
 * tsukumo が配る mermaid（package.json で 12.0.0 に固定）で実際に描けることを目視で確かめた種類
 * （11.15.0 と 12.0.0 の両方で確かめた。docs/display.md 4.2）。`mermaid` の塊の説明が勧めてよいのはこの並びだけで、増やすときは
 * 先にメインビューへ出して描けることを確かめる。
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
 * 同じ場で構文が通らなかった種類と、`chart` のフェンスと用途が重なるので載せない種類。
 * 規約に紛れ込んでいないかを見る。
 */
const KINDS_NOT_TO_OFFER = ["sankey", "architecture", "requirementDiagram", "journey", "xychart"]

const namedTags = [...REPORT_NOTATION_PROMPT.matchAll(/<([a-z]+)[\s>]/g)].flatMap(
  ([, tag]) => tag ?? [],
)
const namedClasses = [...REPORT_NOTATION_PROMPT.matchAll(/class="([^"]+)"/g)].flatMap(
  ([, names]) => names?.split(" ") ?? [],
)

// 見た目はレポートの記法を描く機能の CSS（`markdown/report-notation.module.css`）にある。
// テストの中では class 名が CSS に書いた綴りのまま届く（test/css-module-loader.ts）ので、
// 部品が付け直した名前をそのファイルの選択子とそのまま突き合わせられる。
const STYLE_SHEET_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../src/browser/components/page/conversation/components/main-view/markdown/report-notation.module.css",
      import.meta.url,
    ),
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
    // 書いた名前ではなく部品が付け直した名前なので、実際に描いてからその class を CSS に
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

  it("語彙（src/shared/report-notation.ts）の印はどれも部品で解決され、CSS まで届く", () => {
    // 塊から組む印も、塊にする前の記録ではモデルが書いていたので、描く側は同じに解決する。
    expect(REPORT_NOTATION_NAMES.length).toBe(18)

    for (const name of REPORT_NOTATION_NAMES) {
      const { container } = render(createElement(NotationBlock, { className: name }, "中身"))
      const element = container.firstElementChild

      expect(element?.className).not.toBe(name)
      for (const resolved of element?.className.split(" ") ?? []) {
        expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
      }
    }
  })

  it("逃げ道に書く印は文面に現れ、塊から組む印は文面に class として載せない", () => {
    // 塊の種類がある記法を逃げ道に書くと差し戻すので、文面が勧めると往復が増える。
    for (const name of REPORT_WRITTEN_MARK_NAMES) {
      expect(REPORT_NOTATION_PROMPT).toContain(name)
    }
    for (const name of [...REPORT_NOTE_KINDS.map(([kind]) => kind), ...REPORT_BLOCK_MARK_NAMES]) {
      expect(namedClasses).not.toContain(name)
    }
  })

  it("tsukumo が組む印（検証結果の帯）は文面に載せず、部品で解決され、CSS まで届く", () => {
    for (const name of REPORT_DRAWN_MARK_NAMES) {
      expect(REPORT_NOTATION_PROMPT).not.toContain(`class="${name}"`)

      const { container } = render(createElement(NotationBlock, { className: name }, "中身"))
      const resolved = container.firstElementChild?.className ?? name

      expect(resolved).not.toBe(name)
      expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
    }
  })

  it("note の6種は、どれも部品がラベルを出し、その先に見た目が付いている", () => {
    // 部品（ラベルの文字）→ CSS の鎖を6種ぶん見る。種別の文字を
    // 出すのは tsukumo 側（docs/screen-design.md 13.1 原則5）なので、印だけ足してラベルを足し忘れる
    // と、素の note と同じ「何の塊か読み取れない」状態に戻る。種別の並びは
    // `src/shared/report-notation.ts` の `REPORT_NOTE_KINDS` が正典（並びの理由もそこにある）。
    for (const [name, label] of REPORT_NOTE_KINDS) {
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

  it("出力スタイルとキャラクターの人格の両方を上書きすると明示する", () => {
    expect(REPORT_NOTATION_PROMPT).toContain(
      "出力スタイルやキャラクターの人格に書かれた指示よりこの節を優先する",
    )
  })

  it("レポートの文体は中立と決めている（キャラクターの口調はセリフが担う）", () => {
    // どのパックに切り替えても本文の読みやすさが変わらないようにするための決定
    // （docs/display.md 4.2）。文体を persona.md 側に持たせない。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは中立の文体で書く")
  })

  it("レポートは日本語で書くと決め、送る前の検算にも入れている", () => {
    // 読んだコードや英語の文面に引きずられて本文が英語で出たことがある（docs/display.md 4.2）。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは必ず日本語で書く")
    const beforeSend = REPORT_NOTATION_PROMPT.split("### 送る前に消すもの").at(1) ?? ""
    expect(beforeSend).toContain("日本語でない地の文")
  })

  it("レポートは report ツールで渡させ、その外に書いた本文は画面に出ないと言う", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("`report` ツールで渡す本文")
    expect(REPORT_NOTATION_PROMPT).toContain(
      "レポートは `report` ツール（`mcp__tsukumo__report`）で渡す",
    )
    expect(REPORT_NOTATION_PROMPT).toContain("`report` の外に書いたテキストは")
  })

  it("report が通るとターンが終わり、締めのセリフは closing に入れさせる（「完了」の1行の条は無い）", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("`report` が受け付けられると、そこでターンが終わる")
    expect(REPORT_NOTATION_PROMPT).toContain("締めのセリフは `report` の `closing` に入れる")
    expect(REPORT_NOTATION_PROMPT).toContain("途中の経過は `speak` で言う")
    expect(REPORT_NOTATION_PROMPT).not.toContain("`report` → 締めの `speak` の順で終える")
    expect(REPORT_NOTATION_PROMPT).not.toContain("「完了」")
    expect(REPORT_NOTATION_PROMPT).not.toContain("中間レポートになる")
  })

  it("伝える新しい事実が無いターンは、report を呼ばずに終えてよいと言う", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("伝える新しい事実が無いターン")
    expect(REPORT_NOTATION_PROMPT).toContain("呼ばず、本文も書かずに終えてよい")
  })

  it("人格の締めの例（予告の形）を、書き終えたことの一言に言い換えさせる", () => {
    // ホームのパックや画面から作ったパックの persona.md は tsukumo から直せないため。
    expect(REPORT_NOTATION_PROMPT).toContain("書き終えたことを言う一言にする")
    expect(REPORT_NOTATION_PROMPT).toContain("キャラクターの人格に締めの例があれば")
  })

  it("「結論から書く」「お願いはいちばん最後に1つ」は文面から外し、report の欄に任せる", () => {
    // 順番は `conclusion` → `sections` → `favor` の欄の並びが型で持つ。条の番号はずらさない
    // （条2・条3・条9 を番号で引いているところがある）。
    expect(REPORT_NOTATION_PROMPT).not.toContain("結論から書く")
    expect(REPORT_NOTATION_PROMPT).not.toContain("いちばん最後")
    expect(REPORT_NOTATION_PROMPT).not.toContain("末尾の「お願い」")
    expect(REPORT_NOTATION_PROMPT).toContain("1. **結論は `conclusion` に1〜2文で書く。**")
    expect(REPORT_NOTATION_PROMPT).toContain("`favor` に入れる")
    expect(REPORT_NOTATION_PROMPT).toContain("10. **見出しを付けるなら")
  })

  it("検証の結果は checks に分けさせ、結論は読み手から見た変化で、文字より視覚情報を選ばせる", () => {
    // 結論の括弧に検証の結果が混ざって読みにくかった（docs/display.md 4.2）。
    expect(REPORT_NOTATION_PROMPT).toContain("検証の結果を `conclusion` と `sections` に書かない")
    expect(REPORT_NOTATION_PROMPT).toContain("読み手から見た変化")
    expect(REPORT_NOTATION_PROMPT).toContain("8. **残ったものは、文字より視覚情報で見せる。**")
    const beforeSend = REPORT_NOTATION_PROMPT.split("### 送る前に消すもの").at(1) ?? ""
    expect(beforeSend).toContain("`checks` へ移す")
  })

  it("「描けない」記法は無い（移行の段6で unified に置き換えたため）", () => {
    expect(REPORT_NOTATION_PROMPT).not.toContain("描けない")
  })

  it("勧める mermaid の種類は、描けることを確かめたものだけ", () => {
    const offered: readonly string[] = REPORT_MERMAID_KINDS
    expect(offered).toEqual(DRAWN_MERMAID_KINDS)
    for (const kind of KINDS_NOT_TO_OFFER) {
      expect(REPORT_NOTATION_PROMPT).not.toContain(kind)
    }
  })

  it("印の使いどころは「文へ倒す条件」ではなく用途で書く", () => {
    // 3列目を「迷ったときの判断」から「使う目安」へ反転させた決定（docs/display.md 4.2）。
    // 下限（「3行以上あるときだけ」）を各行に並べると、印を使える内容まで文のまま残る。
    expect(REPORT_NOTATION_PROMPT).toContain("| 内容 | 使う印 | 使う目安 |")
    expect(REPORT_NOTATION_PROMPT).not.toContain("迷ったときの判断")
    expect(REPORT_NOTATION_PROMPT).toContain("文のままでよいのは次のときだけ")
  })

  it("逃げ道には塊の種類が無い記法だけを書かせる", () => {
    // 塊の種類がある記法を逃げ道に書くと差し戻される（`reportViolations` の markdown-notation）。
    expect(REPORT_NOTATION_PROMPT).toContain(
      "どの塊にも当てはまらない記法だけを `markdown` の塊に書く",
    )
    expect(REPORT_NOTATION_PROMPT).not.toContain("GFM のテーブル")
    expect(REPORT_NOTATION_PROMPT).not.toContain("```mermaid")
  })

  it("印を勧めることが、書く量を増やす言い訳にならない", () => {
    // 「まず量を絞り、残ったものに構造を付ける」と噛み合わせるための条項。
    expect(REPORT_NOTATION_PROMPT).toContain(
      "構造を付けられることは、書く量を増やしてよい理由に\nならない",
    )
    expect(REPORT_NOTATION_PROMPT).toContain("印は文の代わりに置くもので、文への足し算ではない")
  })

  it("地の文の段落は3文までとし、4文目の逃がし先に表・箇条書き・fold を挙げる", () => {
    // 全体の量は数で縛らないが、段落の単位にだけは数で縛る決定
    // （docs/display.md 4.2「読む時間を減らすために足すのは、規約の側」）。
    expect(REPORT_NOTATION_PROMPT).toContain("地の文の段落は3文まで")
    expect(REPORT_NOTATION_PROMPT).toContain("4文目が要るなら、表・箇条書きへ移すか `fold` で畳む")
  })

  it("送る前の検算に、4文以上続く段落を挙げている", () => {
    const beforeSend = REPORT_NOTATION_PROMPT.split("### 送る前に消すもの").at(1) ?? ""
    expect(beforeSend).toContain("4文以上続く地の文の段落")
  })
})
