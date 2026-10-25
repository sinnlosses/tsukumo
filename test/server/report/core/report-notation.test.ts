import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath, URL as NodeURL } from "node:url"

import { cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { NotationBlock } from "../../../../src/browser/components/page/conversation/components/markdown/renderer/notation.tsx"
import { REPORT_SANITIZE_SCHEMA } from "../../../../src/browser/components/page/conversation/components/markdown/renderer/sanitize-schema.ts"
import { REPORT_NOTATION_PROMPT } from "../../../../src/server/report/core/report-notation.ts"
import { readGraphSource } from "../../../../src/shared/report/graph-source.ts"
import { REPORT_MERMAID_KINDS } from "../../../../src/shared/report/report-block-diagram.ts"
import {
  parseReportSections,
  REPORT_BLOCK_KINDS,
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

// 見た目はレポートの記法を描く機能の CSS（`markdown/renderer/report-notation.module.css` と `report-notation/*.css`）にある。
// テストの中では class 名が CSS に書いた綴りのまま届く（`classNameStrategy: "non-scoped"`）ので、
// 部品が付け直した名前をそれらのファイルの選択子とそのまま突き合わせられる。
const STYLE_SHEET_DIRECTORY = fileURLToPath(
  new NodeURL(
    "../../../../src/browser/components/page/conversation/components/markdown/renderer/",
    import.meta.url,
  ),
)
const STYLE_SHEET_FILES = [
  "report-notation.module.css",
  ...readdirSync(`${STYLE_SHEET_DIRECTORY}report-notation`).map(
    (file) => `report-notation/${file}`,
  ),
]
const STYLE_SHEET_SOURCE = STYLE_SHEET_FILES.map((file) =>
  readFileSync(`${STYLE_SHEET_DIRECTORY}${file}`, "utf8"),
).join("\n")

describe("REPORT_NOTATION_PROMPT", () => {
  it("見た目の CSS は入口1つと部品9つを読んでいる", () => {
    expect(STYLE_SHEET_FILES).toHaveLength(10)
  })

  it("名乗った要素を rehype-sanitize の schema が通す", () => {
    expect(namedTags.length).toBeGreaterThan(0)

    const allowed = REPORT_SANITIZE_SCHEMA.tagNames ?? []
    for (const tag of new Set(namedTags)) {
      expect(allowed).toContain(tag)
    }
  })

  it("逃げ道で名乗る class は区画の格子と札だけ", () => {
    expect(new Set(namedClasses)).toEqual(new Set(["cols", "card", "badge", "badge-ok"]))
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

  it("レポートは日本語で書くと決める", () => {
    // 読んだコードや英語の文面に引きずられて本文が英語で出たことがある
    // （docs/architecture/display/notation-per-host.md「レポートは必ず日本語で書かせる」）。
    expect(REPORT_NOTATION_PROMPT).toContain("レポートは必ず日本語で書く")
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

  it("勧める mermaid の種類は、描けることを確かめたものだけ", () => {
    const offered: readonly string[] = REPORT_MERMAID_KINDS
    expect(offered).toEqual(DRAWN_MERMAID_KINDS)
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
    // いまの文面（5,140字）に約50字の余白を持たせた上限
    const limit = 5190
    const length = REPORT_NOTATION_PROMPT.length

    expect(
      length,
      `REPORT_NOTATION_PROMPT は今 ${length} 字で、上限 ${limit} 字を超えた。条を足したら他の条を削るか、上限を意図して上げる`,
    ).toBeLessThanOrEqual(limit)
  })
})
