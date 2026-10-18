import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { NotationBlock } from "../../../../src/browser/components/page/conversation/components/markdown/renderer/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../../../src/browser/components/page/conversation/components/markdown/renderer/sanitize-schema.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { REPORT_FIGURE_DESCRIPTION } from "../../../../src/server/report/core/report-tool.ts"
import { readGraphSource } from "../../../../src/shared/report/graph-source.ts"
import { REPORT_MERMAID_KINDS } from "../../../../src/shared/report/report-block-diagram.ts"
import {
  parseReportSections,
  reportBlockSchema,
  REPORT_BLOCK_KINDS,
  REPORT_FIGURE_NONE_REASONS,
} from "../../../../src/shared/report/report-block.ts"
import {
  REPORT_DRAWN_MARK_NAMES,
  REPORT_NOTATION_NAMES,
  REPORT_NOTE_KINDS,
} from "../../../../src/shared/report/report-notation.ts"
import { REPORT_SHAPE_TAGS } from "../../../../src/shared/report/report-shape-tag.ts"

afterEach(() => {
  cleanup()
})

// この規約はレンダラが描けるものの一覧でもある（docs/architecture/display.md「表示」）。文面だけが先に
// 進んで「勧めた記法が描かれない」が起きないよう、名乗った要素と class を両側に突き合わせる。

/**
 * tsukumo が配る mermaid（package.json で 12.0.0 に固定）で実際に描けることを目視で確かめた種類
 * （11.15.0 と 12.0.0 の両方で確かめた。docs/architecture/display.md「表示」）。`mermaid` の塊の説明が勧めてよいのはこの並びだけで、増やすときは
 * 先にメインビューへ出して描けることを確かめる。
 */
const DRAWN_MERMAID_KINDS = [
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

const article8 = REPORT_NOTATION_PROMPT.split("\n8. ").at(1)?.split("\n9. ").at(0) ?? ""

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].flatMap(([, text]) => text ?? [])
}

function articleEightRows(): string[][] {
  return article8
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|[-|\s]+\|$/.test(line))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1))
}

const namedTags = [...REPORT_NOTATION_PROMPT.matchAll(/<([a-z]+)[\s>]/g)].flatMap(
  ([, tag]) => tag ?? [],
)
const namedClasses = [...REPORT_NOTATION_PROMPT.matchAll(/class="([^"]+)"/g)].flatMap(
  ([, names]) => names?.split(" ") ?? [],
)

// 見た目はレポートの記法を描く機能の CSS（`markdown/renderer/report-*.module.css`）にある。
// テストの中では class 名が CSS に書いた綴りのまま届く（`cssModuleIdentityPlugin`）ので、
// 部品が付け直した名前をそれらのファイルの選択子とそのまま突き合わせられる。
const STYLE_SHEET_DIRECTORY = fileURLToPath(
  new URL(
    "../../../../src/browser/components/page/conversation/components/markdown/renderer/",
    import.meta.url,
  ),
)
const STYLE_SHEET_SOURCE = readdirSync(STYLE_SHEET_DIRECTORY)
  .filter((file) => /^report-.*\.module\.css$/.test(file))
  .map((file) => readFileSync(`${STYLE_SHEET_DIRECTORY}${file}`, "utf8"))
  .join("\n")

describe("REPORT_NOTATION_PROMPT", () => {
  it("名乗った要素を rehype-sanitize の schema が通す", () => {
    expect(namedTags.length).toBeGreaterThan(0)

    const allowed = REPORT_SANITIZE_SCHEMA.tagNames ?? []
    for (const tag of new Set(namedTags)) {
      expect(allowed).toContain(tag)
    }
  })

  it("逃げ道に残る記法は class を名乗らない（class を持つ記法は塊から組む）", () => {
    expect(namedClasses).toEqual([])
  })

  it("語彙（src/shared/report/report-notation.ts）の印はどれも部品で解決され、CSS まで届く", () => {
    // 塊から組む印も、塊にする前の記録ではモデルが書いていたので、描く側は同じに解決する。
    expect(REPORT_NOTATION_NAMES.length).toBeGreaterThan(0)

    for (const name of REPORT_NOTATION_NAMES) {
      const { container } = render(createElement(NotationBlock, { className: name }, "中身"))
      const element = container.firstElementChild

      expect(element?.className).not.toBe(name)
      for (const resolved of element?.className.split(" ") ?? []) {
        expect(STYLE_SHEET_SOURCE).toContain(`.${resolved}`)
      }
    }
  })

  it("tsukumo が組む印（検証結果の塊）は文面に載せず、部品で解決され、CSS まで届く", () => {
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
    // 出すのは tsukumo 側（docs/architecture/screen-design/principle-and-type.md「意味を固定した色は誰が来ても変わらず、
    // 文字と対でだけ増やす」）なので、印だけ足してラベルを足し忘れる
    // と、素の note と同じ「何の塊か読み取れない」状態に戻る。種別の並びは
    // `REPORT_NOTE_KINDS` が正典（並びの理由もそこにある）。
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
    // （docs/architecture/display/notation-per-host.md「レポートの文体は tsukumo が決める」）。文体を persona.md 側に持たせない。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは中立の文体で書く")
  })

  it("レポートは日本語で書くと決める", () => {
    // 読んだコードや英語の文面に引きずられて本文が英語で出たことがある
    // （docs/architecture/display/notation-per-host.md「レポートは必ず日本語で書かせる」）。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは必ず日本語で書く")
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
    expect(REPORT_NOTATION_PROMPT).toContain("`favor` に分けて入れる")
    expect(REPORT_NOTATION_PROMPT).toContain("9. **見出しは節の `heading` に書く。**")
    expect(REPORT_NOTATION_PROMPT).toContain("2. **前置きと締めを書かない。**")
    expect(REPORT_NOTATION_PROMPT).toContain("3. **同じことを二度言わない。**")
  })

  it("条10〜15 と条1・6 の追記が入り、図の作法と題の書き方は各 describe にある", () => {
    for (const head of [
      "10. **文は既知から始める。**",
      "11. **今回の作業で生まれた名前だけ、使う前に1行で役割を言う。**",
      "12. **列挙は同種の項目だけ。**",
      "13. **最終レポートは終わった状態から書き直す。**",
      "14. **撮った画像は要る所に切り抜く**",
      "15. **節の並びは `task` の `genre` に合う既定の並び（`task` の説明）に従う**",
      "「それで何が良いか」か「変えていないもの」",
      "「n件中k件」",
    ]) {
      expect(REPORT_NOTATION_PROMPT).toContain(head)
    }
    const graphSchema = JSON.stringify(z.toJSONSchema(reportBlockSchema, { io: "input" }))
    expect(graphSchema).toContain("どの辺にも向きと動詞のラベルを付ける")
    expect(graphSchema).toContain("交差は並びか分割で解く")
    expect(graphSchema).toContain("数と向きで主張を言う1文")
  })

  it("検証の結果は checks に分けさせ、結論は読み手から見た変化で、文字より視覚情報を選ばせる", () => {
    // 結論の括弧に検証の結果が混ざって読みにくかった（docs/architecture/display.md「表示」）。
    expect(REPORT_NOTATION_PROMPT).toContain("検証の結果を `conclusion` と `sections` に書かない")
    expect(REPORT_NOTATION_PROMPT).toContain("読み手から見た変化")
    expect(article8).toContain("**残ったものは、文字より視覚情報で見せる。**")
  })

  it("前後は札にしない添え物で、構造は graph の印、画面は beforeAfter の image、1つの値は table の from / to に分けて書く", () => {
    expect(article8).not.toContain("の側に入れる")
    expect(article8).not.toContain("梯子")
    expect(article8).toContain("前後・確度・所在は札にしない")
    expect(article8).toContain("画面の前後は `image` を `beforeAfter` で")
    expect(article8).toContain("構造の前後は `graph` の行頭の `+ ` `- ` `~ ` で")
    expect(article8).toContain("1つの値の前後は `table` の `from` / `to` で")
  })

  it("条8の頭は figure の欄を指す1行で、図を置く条件と理由の意味は figure の describe だけにある", () => {
    const firing =
      "名前が3つ以上出てきてつながる・流れや分岐がある・構造の前後がある・数が3つ以上ある"

    expect(article8.startsWith("図は `figure` の欄に置く。\n")).toBe(true)
    expect(REPORT_FIGURE_DESCRIPTION).toContain(firing)
    expect(REPORT_NOTATION_PROMPT).not.toContain(firing)
    expect(REPORT_NOTATION_PROMPT).not.toContain("none にしない")
    for (const reason of REPORT_FIGURE_NONE_REASONS) {
      expect(REPORT_NOTATION_PROMPT).not.toContain(reason)
    }
  })

  it("条8の札の表は14の札を1行ずつ持ち、塊の列は report ツールの塊の種類に実在する", () => {
    const rows = articleEightRows()
    const names = rows.flatMap((cells) => cells.slice(1).flatMap(backticked))
    const known: readonly string[] = REPORT_BLOCK_KINDS

    expect(rows.map((cells) => backticked(cells.at(0) ?? ""))).toEqual(
      REPORT_SHAPE_TAGS.map((tag) => [tag]),
    )
    for (const kind of ["mermaid", "graph", "svg", "image", "chart", "table", "list", "text"]) {
      expect(names).toContain(kind)
    }
    for (const name of names) {
      expect(known).toContain(name)
    }
    expect(article8).toContain("その札の第一候補で描く")
    expect(article8).not.toContain("迷ったら上の行で描く")
  })

  it("文のままでよい条件は本文の塊の節の1箇所だけにあり、条8はそこを指して言い直さない", () => {
    const condition = "一息（2〜3文）で言い切れて関係するものが1つしかない"

    expect(article8).toContain("文で言えることでも、表・図・数の塊で見せられるなら")
    expect(article8).toContain("文のままでよいのは下に挙げたときだけ")
    expect(article8).not.toContain("一息")
    expect(REPORT_NOTATION_PROMPT.split(condition)).toHaveLength(2)
    expect(REPORT_NOTATION_PROMPT).toContain("**文のままでよいのは次のときだけ**")
  })

  it("条8の表の graph と mermaid の見本と、構造の前後の印は、report の入口を通る", () => {
    const samples = (kind: string): string[] =>
      [...article8.matchAll(new RegExp(`\`${kind}\`（([^）]+)）`, "g"))].flatMap(
        ([, sample]) => sample ?? [],
      )
    const marks = ["+ ", "- ", "~ "].filter((mark) => article8.includes(`\`${mark}\``))
    const graphSource = [...samples("graph"), ...marks.map((mark) => `${mark}架空 -> 架空2`)].join(
      "\n",
    )
    const mermaidSources = [...new Set(samples("mermaid"))]
    const offered: readonly string[] = REPORT_MERMAID_KINDS
    const blocks = [
      { kind: "graph", direction: "LR", source: graphSource },
      ...mermaidSources.map((source) => ({ kind: "mermaid", source })),
    ]

    expect(samples("graph")).not.toEqual([])
    expect(marks).toEqual(["+ ", "- ", "~ "])
    expect(mermaidSources).toEqual(expect.arrayContaining(["sequenceDiagram", "stateDiagram-v2"]))
    for (const source of mermaidSources) {
      expect(offered).toContain(source)
    }
    for (const block of blocks) {
      expect(parseReportSections([{ heading: "", blocks: [block] }])).toMatchObject({
        sections: [{ blocks: [{ kind: block.kind }] }],
        unknownBlockCount: 0,
      })
    }
    expect(readGraphSource(graphSource).brokenLines).toEqual([])
  })

  it("画面を変えた作業には撮った画像を載せさせ、同じ場面の2枚は beforeAfter で並べさせる", () => {
    expect(REPORT_NOTATION_PROMPT).toContain(
      "画面（見た目）を変えた作業では、撮った画像を `image` の塊で載せる",
    )
    expect(REPORT_NOTATION_PROMPT).toContain("`image` を2つ並べず `beforeAfter` で左右に並べる")
    expect(REPORT_NOTATION_PROMPT).toContain("`unverified` の行を足し")
  })

  it("画像の条は、tsukumo 固有のパスを書かない", () => {
    expect(REPORT_NOTATION_PROMPT).not.toContain("src/browser/")
  })

  it("勧める mermaid の種類は、描けることを確かめたものだけ", () => {
    const offered: readonly string[] = REPORT_MERMAID_KINDS
    expect(offered).toEqual(DRAWN_MERMAID_KINDS)
    for (const kind of KINDS_NOT_TO_OFFER) {
      expect(REPORT_NOTATION_PROMPT).not.toContain(kind)
    }
  })

  it("印の使いどころは「文へ倒す条件」ではなく用途で書く", () => {
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
    expect(REPORT_NOTATION_PROMPT).toContain("印は文の代わりに置くもので、文への足し算ではない")
  })

  it("地の文の段落は3文までとし、4文目の逃がし先に表・箇条書き・fold を挙げる", () => {
    // 全体の量は数で縛らないが、段落の単位にだけは数で縛る決定
    // （docs/architecture/display.md「読む時間を減らす物差しと線引き」）。
    expect(REPORT_NOTATION_PROMPT).toContain("地の文の段落は3文まで")
    expect(REPORT_NOTATION_PROMPT).toContain("4文目が要るなら、表・箇条書きへ移すか `fold` で畳む")
  })

  it("段落ごとの太字は1か所までで、文面が書き手に求める「1段落に1か所まで」を文面自身が守る", () => {
    // 数える範囲は文面の「地が付く」範囲（地の文だけ。表・箇条書き・塊の中は除く）と同じ。
    const paragraphs = REPORT_NOTATION_PROMPT.replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "")
      .replace(/^( *)(?:\d+\.|[-*]) .*(?:\n\1 +\S.*)*/gm, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("|"))
      .join("\n")
      .split(/\n\s*\n/)

    for (const paragraph of paragraphs) {
      const bolds = paragraph.match(/\*\*[^*]+\*\*/g) ?? []
      expect(
        bolds.length,
        `太字が ${bolds.length} か所ある段落がある（1か所まで）: ${paragraph.slice(0, 40)}…`,
      ).toBeLessThanOrEqual(1)
    }
  })

  it("文面の字数は上限以下に収まり、条を足すと落ちる", () => {
    // いまの文面（条8の札の表14行を含めて4,542字）に約50字の余白を持たせた上限
    const limit = 4600
    const length = REPORT_NOTATION_PROMPT.length

    expect(
      length,
      `REPORT_NOTATION_PROMPT は今 ${length} 字で、上限 ${limit} 字を超えた。条を足したら他の条を削るか、上限を意図して上げる`,
    ).toBeLessThanOrEqual(limit)
  })
})
