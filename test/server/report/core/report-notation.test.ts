import { afterEach, describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"

import { NotationBlock } from "../../../../src/browser/components/page/conversation/components/main-view/markdown/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../../../src/browser/components/page/conversation/components/main-view/markdown/sanitize-schema.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { REPORT_NOTATION_NAMES, REPORT_NOTE_KINDS } from "../../../../src/shared/report-notation.ts"

afterEach(() => {
  cleanup()
})

// この規約は**レンダラが描けるものの一覧**でもある（docs/display.md 4.2）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

/**
 * tsukumo が配る mermaid（package.json で 12.0.0 に固定）で**実際に描けることを目視で確かめた種類**
 * （11.15.0 と 12.0.0 の両方で確かめた。docs/display.md 4.2）。規約が勧めてよいのはこの並びだけで、**増やすときは
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

// 見た目はレポートの記法を描く機能の CSS（`markdown/report-notation.module.css`）にある。
// **テストの中では class 名が CSS に書いた綴りのまま届く**（test/css-module-loader.ts）ので、
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

  it("語彙（src/shared/report-notation.ts）の印がすべて文面に現れ、部品で解決され、CSS まで届く", () => {
    // 前の2つのテストは文面から拾った class 名しか見ないので、**文面が地の文の言葉としてしか
    // 挙げていない印**（`note-warn` / `note-ng` / `note-ask` / `note-memo` / `badge-warn` /
    // `badge-ng` は `class="..."` の外の言い添えでしか出てこない）は拾えない。語彙を唯一の
    // 出どころにして、14の印すべてで同じ鎖（文面 → 部品 → CSS）を見る。
    expect(REPORT_NOTATION_NAMES.length).toBe(14)

    for (const name of REPORT_NOTATION_NAMES) {
      expect(REPORT_NOTATION_PROMPT).toContain(name)

      const { container } = render(createElement(NotationBlock, { className: name }, "中身"))
      const element = container.firstElementChild

      expect(element?.className).not.toBe(name)
      for (const resolved of element?.className.split(" ") ?? []) {
        expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
      }
    }
  })

  it("note の6種を名乗り、どれも部品がラベルを出し、その先に見た目が付いている", () => {
    // 規約（モデルが書く名前）→ 部品（ラベルの文字）→ CSS の鎖を6種ぶん見る。**種別の文字を
    // 出すのは tsukumo 側**（docs/screen-design.md 13.1 原則5）なので、印だけ足してラベルを足し忘れる
    // と、素の note と同じ「何の塊か読み取れない」状態に戻る。**種別の並びは
    // `src/shared/report-notation.ts` の `REPORT_NOTE_KINDS` が正典**（並びの理由もそこにある）。
    for (const [name, label] of REPORT_NOTE_KINDS) {
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

  it("ターンは report → 締めの speak で終えさせ、そのあとに本文を書かせない（「完了」の1行の条は無い）", () => {
    expect(REPORT_NOTATION_PROMPT).toContain("ターンは `report` → 締めの `speak` の順で終える")
    expect(REPORT_NOTATION_PROMPT).toContain("締めの `speak` のあとには何も\n書かない")
    expect(REPORT_NOTATION_PROMPT).not.toContain("「完了」")
    expect(REPORT_NOTATION_PROMPT).not.toContain("ターンは締めの `speak` → レポートの順で終える")
    expect(REPORT_NOTATION_PROMPT).not.toContain("レポートの前に言う")
    expect(REPORT_NOTATION_PROMPT).not.toContain("レポートの前の `speak`")
    const beforeSend = REPORT_NOTATION_PROMPT.split("### 送る前に消すもの").at(1) ?? ""
    expect(beforeSend).toContain("`report` のあとに続けようとしているもの")
  })

  it("人格の締めの例（予告の形）を、書き終えたことの一言に言い換えさせる", () => {
    // ホームのパックや画面から作ったパックの persona.md は tsukumo から直せないため。
    expect(REPORT_NOTATION_PROMPT).toContain("締めの `speak` は書き終えた")
    expect(REPORT_NOTATION_PROMPT).toContain("キャラクターの人格に締めの例があれば")
  })

  it("「結論から書く」「お願いはいちばん最後に1つ」は文面から外し、report の欄に任せる", () => {
    // 順番は `conclusion` → `body` → `favor` の欄の並びが型で持つ。条の番号はずらさない
    // （条2・条3・条9 を番号で引いているところがある）。
    expect(REPORT_NOTATION_PROMPT).not.toContain("結論から書く")
    expect(REPORT_NOTATION_PROMPT).not.toContain("いちばん最後")
    expect(REPORT_NOTATION_PROMPT).not.toContain("末尾の「お願い」")
    expect(REPORT_NOTATION_PROMPT).toContain("1. **結論は `conclusion` に1〜2文で書く。**")
    expect(REPORT_NOTATION_PROMPT).toContain("`favor` に入れる")
    expect(REPORT_NOTATION_PROMPT).toContain("10. **見出しを付けるなら")
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
    // 3列目を「迷ったときの判断」から「使う目安」へ反転させた決定（docs/display.md 4.2）。
    // 下限（「3行以上あるときだけ」）を各行に並べると、印を使える内容まで文のまま残る。
    expect(REPORT_NOTATION_PROMPT).toContain("| 内容 | 使う印 | 使う目安 |")
    expect(REPORT_NOTATION_PROMPT).not.toContain("迷ったときの判断")
    expect(REPORT_NOTATION_PROMPT).toContain("文のままでよいのは次のときだけ")
  })

  it("表には見出しを付けさせ、その中身をセルに無いことへ絞る", () => {
    // 条3（同じことを二度言わない）とのぶつかりを、見出しに書いてよい中身を絞って畳んだ決定
    // （docs/display.md 4.2）。絞りを落とすと、見出しが表の言い直しになる。
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
    // 「関係が2つ以上」は数えられず、同じ表の「項目が2つ以上」に負けていた（docs/display.md 4.2）。
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

  it("地の文の段落は3文までとし、4文目の逃がし先に表・箇条書き・<details> を挙げる", () => {
    // 全体の量は数で縛らないが、段落の単位にだけは数で縛る決定
    // （docs/display.md 4.2「読む時間を減らすために足すのは、規約の側」）。
    expect(REPORT_NOTATION_PROMPT).toContain("地の文の段落は3文まで")
    expect(REPORT_NOTATION_PROMPT).toContain(
      "4文目が要るなら、表・箇条書き・`<details>` のどれかへ移す",
    )
  })

  it("送る前の検算に、4文以上続く段落を挙げている", () => {
    const beforeSend = REPORT_NOTATION_PROMPT.split("### 送る前に消すもの").at(1) ?? ""
    expect(beforeSend).toContain("4文以上続く地の文の段落")
  })
})
