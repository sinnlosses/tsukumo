import { describe, expect, it } from "vitest"

import { reportSectionsMarkdown } from "../../../../../../src/browser/components/page/conversation/domain/report-markdown.ts"
import { encodeMarks } from "../../../../../../src/shared/report/code-mark.ts"
import type { FigureBlock } from "../../../../../../src/shared/report/report-block.ts"
import {
  NO_IMAGES,
  captionNumbers,
  markdownOf,
  section,
} from "../../../../../fixture/report-markdown.ts"

const code = (source: string): FigureBlock => ({
  kind: "code",
  language: "ts",
  path: "",
  source,
  marks: [],
  fold: "",
  aside: "",
})

describe("reportSectionsMarkdown", () => {
  it("節が無ければ空になる", () => {
    expect(reportSectionsMarkdown([], NO_IMAGES)).toBe("")
  })

  it("節の見出しは ## で出し、塊と節は空行で区切る。空の見出しは置かない", () => {
    const first = code("const a = 1\n")
    const second = code("const b = 2\n")
    const sections = [
      section([first], "架空の節"),
      section([], ""),
      section([second], "架空の次の節"),
    ]

    expect(reportSectionsMarkdown(sections, NO_IMAGES)).toBe(
      ["## 架空の節", markdownOf(first), "## 架空の次の節", markdownOf(second)].join("\n\n"),
    )
  })

  it.each([
    ["言語・marks", "ts", "", true, "```ts $marks"],
    ["言語・パス・marks", "ts", "src/a.ts", true, "```ts src/a.ts $marks"],
    ["言語が空でパスだけ", "", "src/a.ts", false, "```text src/a.ts"],
    ["言語が空で marks だけ", "", "", true, "```text $marks"],
    ["言語が空でパスと marks", "", "src/a.ts", true, "```text src/a.ts $marks"],
    ["言語もパスも marks も無い", "", "", false, "```"],
  ])(
    "code の info は %s のとき、marks を符号化した 1 語を末尾に添え、言語が空でパスか marks があれば先頭を text で埋める",
    (_, language, path, withMarks, info) => {
      const marks = [{ lines: "1-2", label: "架空の印 a b" }]
      const markdown = markdownOf({
        kind: "code",
        language,
        path,
        source: "a\nb\n",
        marks: withMarks ? marks : [],
        fold: "",
        aside: "",
      })

      expect(encodeMarks(marks)).not.toMatch(/\s/)
      expect(markdown.split("\n")[0]).toBe(info.replace("$marks", encodeMarks(marks)))
    },
  )

  it("図と表は別々に1から数え、題が空でも fold の中でも数える", () => {
    const image = (fold: string): FigureBlock => ({
      kind: "image",
      path: "架空.png",
      caption: "",
      notes: [],
      fold,
      aside: "",
    })
    const table = (title: string): FigureBlock => ({
      kind: "table",
      title,
      columns: ["項目", "件数"],
      rows: [["架空の a", "1"]],
      rest: "",
      fold: "",
      aside: "",
    })
    const mermaid: FigureBlock = {
      kind: "mermaid",
      title: "",
      source: "sequenceDiagram",
      fold: "",
      aside: "",
    }

    expect(
      captionNumbers([
        section([image(""), table("")]),
        section([image("架空の畳み"), mermaid, table("架空の表")]),
      ]),
    ).toEqual(["図 1", "表 1", "図 2", "図 3", "表 2"])
  })

  it("fold のある塊は details に畳む", () => {
    const block = code("const a = 1\n")

    expect(markdownOf({ ...block, fold: "架空の<見出し>" })).toBe(
      `<details><summary>架空の&lt;見出し&gt;</summary>\n\n${markdownOf(block)}\n\n</details>`,
    )
  })

  describe("欄外注（部品の aside）", () => {
    const asideNote = (value: string): string =>
      `<aside class="gutter-note">\n\n${value}\n\n</aside>`
    const withGutter = (body: string, notes: readonly string[]): string =>
      [
        '<div class="with-gutter">',
        body,
        ['<div class="gutter">', ...notes, "</div>"].join("\n\n"),
        "</div>",
      ].join("\n\n")

    it("aside のある部品は外枠の中で、部品のあとに欄外注が出る", () => {
      const block = code("const a = 1\n")

      expect(markdownOf({ ...block, aside: "出どころ: 架空の `a.ts:3`" })).toBe(
        withGutter(markdownOf(block), [asideNote("出どころ: 架空の `a.ts:3`")]),
      )
    })

    it("fold のある部品は details ごと包み、欄外注は details の外に置く", () => {
      const block = code("const a = 1\n")

      expect(markdownOf({ ...block, fold: "架空の畳み", aside: "架空の出典" })).toBe(
        withGutter(`<details><summary>架空の畳み</summary>\n\n${markdownOf(block)}\n\n</details>`, [
          asideNote("架空の出典"),
        ]),
      )
    })

    it("欄外注の文字は逃がし、空白だけの aside は欄外注にしない", () => {
      const block = code("const a = 1\n")

      expect(markdownOf({ ...block, aside: "架空の<b>出典</b>" })).toBe(
        withGutter(markdownOf(block), [asideNote("架空の&lt;b>出典&lt;/b>")]),
      )
      expect(markdownOf({ ...block, aside: "  " })).toBe(markdownOf(block))
    })
  })
})
