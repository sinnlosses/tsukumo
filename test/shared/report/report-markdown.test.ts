import { describe, expect, it } from "vitest"

import { encodeMarks } from "../../../src/shared/report/code-mark.ts"
import { type ReportBlock, reportSectionsOfBody } from "../../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"
import {
  NO_IMAGES,
  captionNumbers,
  markdownOf,
  section,
  statItem,
  text,
} from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
  it("逃げ道の塊は中身をそのまま出し、本文から畳んだ節は元の本文と同じ Markdown になる", () => {
    const body = '## 架空の見出し\n\n<div class="note">架空の注記</div>\n\n- 架空の項目'

    expect(reportSectionsMarkdown(reportSectionsOfBody(body), NO_IMAGES)).toBe(body)
    expect(reportSectionsMarkdown([], NO_IMAGES)).toBe("")
  })

  it("節の見出しは ## で出し、塊と節は空行で区切る。空の見出し・空の塊は置かない", () => {
    const sections = [
      section([text("架空の一。"), text(" ")], "架空の節"),
      section([{ kind: "markdown", markdown: "", fold: "", aside: "" }], ""),
      section([text("架空の二。")], "架空の次の節"),
    ]

    expect(reportSectionsMarkdown(sections, NO_IMAGES)).toBe(
      '## 架空の節\n\n架空の一。\n\n<div class="report-section-break"></div>\n\n' +
        "## 架空の次の節\n\n架空の二。",
    )
  })

  it("節と節の境目には見た目を持たない印を挟む。見出しの無い節どうしでも挟む", () => {
    const sections = [section([text("架空の一。")]), section([text("架空の二。")])]

    expect(reportSectionsMarkdown(sections, NO_IMAGES)).toBe(
      '架空の一。\n\n<div class="report-section-break"></div>\n\n架空の二。',
    )
  })

  it.each([
    ["info", "note"],
    ["warn", "note note-warn report-pause-point"],
    ["ng", "note note-ng report-pause-point"],
  ] as const)(
    "note の %s は種別の class の塊で、中に Markdown を入れるので内側の前後に空行を空ける。注意・異常は筆を留める印（report-pause-point）を併せ持つ",
    (tone, className) => {
      expect(markdownOf({ kind: "note", tone, text: "架空の本文", fold: "", aside: "" })).toBe(
        `<div class="${className}">\n\n架空の本文\n\n</div>`,
      )
    },
  )

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

  it("図の6種と表の2種は別々に1から数え、題が空でも fold の中でも数え、options は数えない", () => {
    const image = (fold: string): ReportBlock => ({
      kind: "image",
      path: "架空.png",
      caption: "",
      notes: [],
      fold,
      aside: "",
    })
    const table: ReportBlock = {
      kind: "table",
      title: "",
      columns: ["項目", "件数"],
      rows: [["架空の a", "1"]],
      rest: "",
      fold: "",
      aside: "",
    }
    const options: ReportBlock = {
      kind: "options",
      title: "",
      items: [
        { name: "架空の案A", verdict: "adopt", reason: "架空の理由" },
        { name: "架空の案B", verdict: "reject", reason: "架空の理由" },
      ],
      fold: "",
      aside: "",
    }
    const mermaid: ReportBlock = {
      kind: "mermaid",
      title: "",
      source: "sequenceDiagram",
      fold: "",
      aside: "",
    }
    const matrix: ReportBlock = {
      kind: "matrix",
      title: "",
      columns: ["列A"],
      rows: [{ name: "行1", cells: ["ok"] }],
      fold: "",
      aside: "",
    }

    expect(
      captionNumbers([
        section([image(""), table, options]),
        section([image("架空の畳み"), mermaid, matrix]),
      ]),
    ).toEqual(["図 1", "表 1", "図 2", "図 3", "表 2"])
  })

  it("stats は図として数え、image・chart と通しの番号になり、fold の中でも数える", () => {
    const stats = (fold: string): ReportBlock => ({
      kind: "stats",
      items: [{ ...statItem, value: "1", label: "架空" }],
      fold,
      aside: "",
    })
    const image: ReportBlock = {
      kind: "image",
      path: "架空.png",
      caption: "",
      notes: [],
      fold: "",
      aside: "",
    }
    const chart: ReportBlock = {
      kind: "chart",
      title: "",
      chartKind: "bar",
      labels: ["a"],
      series: [{ name: "系列", values: [1] }],
      horizontal: false,
      fold: "",
      aside: "",
    }

    expect(
      captionNumbers([section([image, stats(""), chart]), section([stats("架空の畳み")])]),
    ).toEqual(["図 1", "図 2", "図 3", "図 4"])
  })

  it("fold のある塊は details に畳む", () => {
    expect(
      markdownOf({ kind: "text", text: "架空の脇道。", fold: "架空の<見出し>", aside: "" }),
    ).toBe("<details><summary>架空の&lt;見出し&gt;</summary>\n\n架空の脇道。\n\n</details>")
  })

  describe("傍注（塊の aside と memo の note）", () => {
    const memo = (value: string): ReportBlock => ({
      kind: "note",
      tone: "memo",
      text: value,
      fold: "",
      aside: "",
    })
    const asideNote = (value: string): string =>
      `<aside class="gutter-note">\n\n${value}\n\n</aside>`
    const memoNote = (value: string): string =>
      asideNote(`<span class="gutter-note-label">メモ</span>${value}`)
    const withGutter = (body: string, notes: readonly string[]): string =>
      [
        '<div class="with-gutter">',
        ...(body === "" ? [] : [body]),
        ['<div class="gutter">', ...notes, "</div>"].join("\n\n"),
        "</div>",
      ].join("\n\n")

    it("aside のある塊は包みの中で、塊のあとに傍注が出る", () => {
      expect(markdownOf({ ...text("架空の本文。"), aside: "出どころ: 架空の `a.ts:3`" })).toBe(
        withGutter("架空の本文。", [asideNote("出どころ: 架空の `a.ts:3`")]),
      )
    })

    it("memo の note は直前の塊の傍注になり、本文の位置に note-memo が残らない", () => {
      const markdown = reportSectionsMarkdown(
        [section([text("架空の本文。"), memo("架空の覚え書き。"), text("架空の次の段落。")])],
        NO_IMAGES,
      )

      expect(markdown).toBe(
        [withGutter("架空の本文。", [memoNote("架空の覚え書き。")]), "架空の次の段落。"].join(
          "\n\n",
        ),
      )
      expect(markdown).not.toContain("note-memo")
    })

    it("塊の aside と続く memo は1つの傍注の並びに、書いた順で並ぶ", () => {
      expect(
        reportSectionsMarkdown(
          [section([{ ...text("架空の本文。"), aside: "架空の出典" }, memo("架空の覚え書き。")])],
          NO_IMAGES,
        ),
      ).toBe(withGutter("架空の本文。", [asideNote("架空の出典"), memoNote("架空の覚え書き。")]))
    })

    it("節の最初の memo は塊の無い包みになり、前の節の塊には付かない", () => {
      expect(
        reportSectionsMarkdown(
          [section([text("架空の前の節。")]), section([memo("架空の覚え書き。")], "架空の見出し")],
          NO_IMAGES,
        ),
      ).toBe(
        [
          "架空の前の節。",
          '<div class="report-section-break"></div>',
          "## 架空の見出し",
          withGutter("", [memoNote("架空の覚え書き。")]),
        ].join("\n\n"),
      )
    })

    it("fold のある塊は details ごと包み、傍注は details の外に置く", () => {
      expect(markdownOf({ ...text("架空の脇道。"), fold: "架空の畳み", aside: "架空の出典" })).toBe(
        withGutter("<details><summary>架空の畳み</summary>\n\n架空の脇道。\n\n</details>", [
          asideNote("架空の出典"),
        ]),
      )
    })

    it("傍注の文字は逃がし、空白だけの aside と空の memo は傍注にしない", () => {
      expect(markdownOf({ ...text("架空の本文。"), aside: "架空の<b>出典</b>" })).toBe(
        withGutter("架空の本文。", [asideNote("架空の&lt;b>出典&lt;/b>")]),
      )
      expect(
        reportSectionsMarkdown(
          [section([{ ...text("架空の本文。"), aside: "  " }, memo(" ")])],
          NO_IMAGES,
        ),
      ).toBe("架空の本文。")
    })
  })
})
