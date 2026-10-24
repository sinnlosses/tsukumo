import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"
import {
  NO_IMAGES,
  captionRow,
  markdownOf,
  section,
  statItem,
} from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
  it("files は頭に種別ごとの合計の札を並べ、1行に1ファイルで種別の札・パス（フォルダ・ファイル名）・注記を並べる", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [
        { path: "src/架空<a>.ts", change: "modified", note: "架空の `注記`" },
        { path: "src/架空`b`.ts", change: "added", note: "" },
        { path: "src/架空c.ts", change: "deleted", note: "" },
        { path: "docs/架空d.md", change: "read", note: "" },
      ],
      title: "",
      fold: "",
      aside: "",
    }
    const badge = (symbol: string, className: string, label: string): string =>
      `<span class="file-change ${className}"><span class="file-change-symbol">${symbol}</span>${label}</span>`
    const entry = (guide: string, fullPath: string, name: string): string =>
      `<span class="file-entry"><span class="file-branch" aria-hidden="true">${guide}</span>` +
      `<code data-file-path="${fullPath}"><span class="file-path-name">${name}</span></code></span>`
    const folder = (guide: string, name: string): string =>
      `<div class="file-folder"><span class="file-branch" aria-hidden="true">${guide}</span>` +
      `<span class="file-path-folder">${name}/<wbr></span></div>`

    // パスは inline code の記法として解かず、そのまま文字にする（バッククォートを含むパスも崩さない）。
    // 追加で説明が無い行だけ「新しく作った」を補足で入れ、ほかの種別で説明が無い行は列を空にする。
    expect(markdownOf(files)).toBe(
      '<div class="files">' +
        `${folder("├── ", "src")}` +
        `<div class="file">${badge("~", "file-change-modified", "変更")}` +
        `${entry("│   ├── ", "src/架空&lt;a&gt;.ts", "架空&lt;a&gt;.ts")}` +
        '<span class="file-note">架空の <code>注記</code></span></div>' +
        `<div class="file">${badge("+", "file-change-added", "追加")}` +
        `${entry("│   ├── ", "src/架空`b`.ts", "架空`b`.ts")}` +
        '<span class="file-note file-note-empty">新しく作った</span></div>' +
        `<div class="file">${badge("-", "file-change-deleted", "削除")}` +
        `${entry("│   └── ", "src/架空c.ts", "架空c.ts")}</div>` +
        `${folder("└── ", "docs")}` +
        `<div class="file">${badge("·", "file-change-read", "読んだ")}` +
        `${entry("    └── ", "docs/架空d.md", "架空d.md")}</div>` +
        '<div class="files-summary">' +
        `${badge("+", "file-change-added", "追加 1")}` +
        `${badge("~", "file-change-modified", "変更 1")}` +
        `${badge("-", "file-change-deleted", "削除 1")}` +
        `${badge("·", "file-change-read", "読んだ 1")}` +
        "</div>" +
        "</div>",
    )
  })

  it("files に title があれば、塊の下に「図 n」の題を付けて番号を既存の図と通しで数える。title が空なら番号を数えない", () => {
    const files = (title: string): ReportBlock => ({
      kind: "files",
      items: [{ path: "a.md", change: "read", note: "" }],
      title,
      fold: "",
      aside: "",
    })
    const stats: ReportBlock = {
      kind: "stats",
      items: [{ ...statItem, value: "1", label: "架空" }],
      fold: "",
      aside: "",
    }
    const bare = markdownOf(files(""))

    expect(bare.startsWith('<div class="files">')).toBe(true)
    expect(bare).not.toContain("caption")

    const markdown = reportSectionsMarkdown(
      [section([stats, files(""), files("架空の一覧"), stats])],
      NO_IMAGES,
    )
    expect(markdown).toContain(`${bare}\n\n<div class="captioned"><div class="files">`)
    expect(markdown).toContain(`${captionRow("図", 2, "架空の一覧")}</div>`)
    expect(markdown).toContain(captionRow("図", 3))
  })

  it("files のフォルダの無いパスだけの塊は、罫もフォルダの行も出さず平らな行にする", () => {
    const files: ReportBlock = {
      kind: "files",
      items: [{ path: "a.md", change: "read", note: "" }],
      title: "",
      fold: "",
      aside: "",
    }

    expect(markdownOf(files)).toContain(
      '<div class="file"><span class="file-change file-change-read">' +
        '<span class="file-change-symbol">·</span>読んだ</span>' +
        '<code><span class="file-path-name">a.md</span></code></div>',
    )
    expect(markdownOf(files)).not.toContain("file-branch")
  })

  describe("note の先頭の +n −m の差分量の棒", () => {
    const filesWith = (notes: readonly string[]): ReportBlock => ({
      kind: "files",
      items: notes.map((note, index) => ({
        path: `src/架空${String(index)}.ts`,
        change: "modified" as const,
        note,
      })),
      title: "",
      fold: "",
      aside: "",
    })
    const widthsOf = (markdown: string): readonly string[] =>
      [...markdown.matchAll(/class="file-diff".*?width: (\d+)%/g)].map((match) => match[1] ?? "")

    it("+9 −1・+14・−3（全角のマイナス）・-3（半角）に、塊の最大に対する割合の棒が付く", () => {
      const markdown = markdownOf(filesWith(["+9 −1", "+14", "−3", "-3"]))

      expect(widthsOf(markdown)).toEqual(["71", "100", "21", "21"])
      expect(markdown).toContain('<span class="file-note">+9 −1</span>')
    })

    it("読めない note と空の note には棒を付けず、読める行が無い塊は棒の無い出力のまま", () => {
      const mixed = markdownOf(filesWith(["+4", "目盛りを読む口", ""]))
      const unreadable = markdownOf(filesWith(["目盛りを読む口", "", "9 行足した"]))

      expect(widthsOf(mixed)).toEqual(["100"])
      expect(mixed.match(/file-diff/g)).toHaveLength(1)
      expect(unreadable).not.toContain("file-diff")
    })
  })
})
