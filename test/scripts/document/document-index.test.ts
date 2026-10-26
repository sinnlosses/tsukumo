import { describe, expect, it } from "vitest"

import {
  childListRows,
  decisionRows,
  readAdrStatus,
  readChildIndex,
  readTableRows,
  replaceTable,
  rewriteChildIndex,
} from "../../../scripts/document/document-index.ts"

describe("decisionRows", () => {
  it("ADR をファイル名の昇順に、パスと題の行にする", () => {
    expect(
      decisionRows([
        { fileName: "0002-b.adr", title: "題B", status: "廃止" },
        { fileName: "0001-a.adr", title: "題A", status: "採用" },
        { fileName: "0003-c.adr", title: "題C", status: "置き換え済み（→ 0004）" },
      ]),
    ).toEqual([
      ["`docs/architecture/adr/0001-a.adr`", "題A", "採用"],
      ["`docs/architecture/adr/0002-b.adr`", "題B", "廃止"],
      ["`docs/architecture/adr/0003-c.adr`", "題C", "置き換え済み（→ 0004）"],
    ])
  })
})

describe("readAdrStatus", () => {
  const adr = (secondLine: string): string => ["# 題", secondLine, "", "本文"].join("\n")

  it("題の次の空でない行の `ステータス: ` の値を返す（整形が入れる空行は読み飛ばす）", () => {
    expect(readAdrStatus(["# 題", "", "ステータス: 採用", "", "本文"].join("\n"))).toBe("採用")
    expect(readAdrStatus(adr("ステータス: 採用"))).toBe("採用")
    expect(readAdrStatus(adr("ステータス: 廃止"))).toBe("廃止")
    expect(readAdrStatus(adr("ステータス: 置き換え済み（→ 0034）"))).toBe("置き換え済み（→ 0034）")
  })

  it("ステータスの行が無い・題の次の空でない行でない・値が不正なら undefined", () => {
    expect(readAdrStatus(adr(""))).toBeUndefined()
    expect(readAdrStatus(["# 題", "", "本文", "ステータス: 採用"].join("\n"))).toBeUndefined()
    expect(readAdrStatus(adr("ステータス: 保留"))).toBeUndefined()
    expect(readAdrStatus(adr("ステータス: 置き換え済み"))).toBeUndefined()
    expect(readAdrStatus("# 題")).toBeUndefined()
  })
})

describe("childListRows", () => {
  const children = [
    {
      fileName: "view.md",
      text: [
        "# 用語集: 見る",
        "",
        "冒頭の一言。",
        "",
        "## 節の索引",
        "",
        "## 画面",
        "### メインビュー",
        "#### 小節",
        "##### 5段目は載せない",
        "### サイドバー",
        "",
        "```bash",
        "## コードブロックの中は見出しでない",
        "```",
        "",
        "## 面",
      ].join("\n"),
    },
    { fileName: "block.md", text: ["# 用語集: 塊", "", "## 塊"].join("\n") },
  ]

  it("子をファイル名の昇順に、パス・題・`##` と `###` の見出し（節の索引とコードブロックの中を除く）の行にする", () => {
    expect(childListRows("docs/glossary", children)).toEqual([
      ["`docs/glossary/block.md`", "用語集: 塊", "塊"],
      ["`docs/glossary/view.md`", "用語集: 見る", "画面 / メインビュー / サイドバー / 面"],
    ])
  })

  it("`##`・`###` が同じ兄弟は、`####` の見出しで行が分かれる", () => {
    const siblings = ["前半", "後半"].map((part) => ({
      fileName: `${part}.md`,
      text: ["# 題", "## 13. 画面", "### 13.9 帯", `#### ${part}の小節`].join("\n"),
    }))

    expect(childListRows("notes", siblings).map(([, , sections]) => sections)).toEqual([
      "13. 画面 / 13.9 帯 / 前半の小節",
      "13. 画面 / 13.9 帯 / 後半の小節",
    ])
  })

  it("子の `##`・`###` の見出しは、どの子のものも1つ残らず行に入る", () => {
    const rows = childListRows("docs/x", children)
    const headings = children.flatMap(({ text }) =>
      text
        .split("\n")
        .filter((line) => /^#{2,3} /.test(line))
        .map((line) => line.replace(/^#+ /, ""))
        .filter((heading) => heading !== "節の索引" && !heading.startsWith("コードブロック")),
    )

    expect(headings).toHaveLength(5)
    for (const heading of headings) {
      expect(rows.some((row) => (row[2] ?? "").split(" / ").includes(heading))).toBe(true)
    }
  })

  it("子が無ければ行も無い", () => {
    expect(childListRows("docs/x", [])).toEqual([])
  })

  it("読み方の案内の見出しは「節」の列に載せない", () => {
    const parent = {
      fileName: "screen.md",
      text: ["# 画面", "## このドキュメントの読み方", "### このファイルは通読しない", "## 色"].join(
        "\n",
      ),
    }

    expect(childListRows("notes", [parent])).toEqual([["`notes/screen.md`", "画面", "色"]])
  })
})

describe("子の文書の節の索引", () => {
  const document = (sections: readonly string[], index: readonly string[]): string =>
    ["# 題", "", "冒頭の一言。", "", ...index, ...sections].join("\n")
  const index = ["## 節の索引", "", "| 節 | 中身 |", "| --- | --- |", "| ## 甲 | 手書き |", ""]
  const threeSections = [
    "## 甲",
    "",
    "### 甲の1",
    "",
    "#### 子の索引には載せない小節",
    "",
    "```md",
    "## コードブロックの中は節でない",
    "```",
    "",
    "### 甲の2",
    "",
    "## 乙",
    "",
    "## 丙",
    "",
    "### 丙の1",
    "",
  ]
  const twoSections = ["## 甲", "", "### 甲の1", "", "## 乙", "", "本文。", ""]

  it("節の索引が無い文書は照らさず、書き直しても変えない", () => {
    const text = document(twoSections, [])

    expect(readChildIndex(text)).toBeUndefined()
    expect(rewriteChildIndex(text)).toBe(text)
  })

  it("本文の `##` の節が2つの文書に索引があれば食い違い、書き直すと索引の節だけが消える", () => {
    const text = document(twoSections, index)

    expect(readChildIndex(text)).toEqual({ expected: [], actual: [["## 節の索引"]] })
    expect(rewriteChildIndex(text)).toBe(document(twoSections, []))
  })

  it("節が3つの文書の索引は、`##` ごとに `###` をつないだ行と比べ、書き直すと見出し行ごと組む", () => {
    const text = document(threeSections, index)
    const expected = [
      ["## 甲", "甲の1 / 甲の2"],
      ["## 乙", ""],
      ["## 丙", "丙の1"],
    ]

    expect(readChildIndex(text)).toEqual({ expected, actual: [["## 甲", "手書き"]] })

    const rewritten = rewriteChildIndex(text)
    expect(rewritten).toContain(
      ["| 節 | 小節 |", "| --- | --- |", "| ## 甲 | 甲の1 / 甲の2 |", "| ## 乙 |  |"].join("\n"),
    )
    expect(readChildIndex(rewritten)).toEqual({ expected, actual: expected })
  })

  it("本文の `##`・`###` の見出しは1つ残らず索引の行に入る", () => {
    const state = readChildIndex(document(threeSections, index))
    const cells = (state?.expected ?? []).flatMap(([section = "", subsections = ""]) => [
      section.replace(/^## /, ""),
      ...subsections.split(" / ").filter((title) => title !== ""),
    ])
    const headings = threeSections
      .filter((line) => /^#{2,3} /.test(line) && !line.includes("コードブロック"))
      .map((line) => line.replace(/^#+ /, ""))

    expect(headings).toHaveLength(6)
    expect(cells).toEqual(headings)
  })

  it("`## 節の索引` の直後に `###` で本文が始まっても、本文の見出しと中身は残す", () => {
    const text = ["# 題", "## 節の索引", "| 節 |", "### 甲", "甲の本文。", "### 乙", "乙の本文。"]

    expect(rewriteChildIndex(text.join("\n"))).toBe(
      ["# 題", "### 甲", "甲の本文。", "### 乙", "乙の本文。"].join("\n"),
    )
  })

  it("`###` の節の索引は、次の見出しの手前までを消す", () => {
    const text = [
      "# 題",
      "## このドキュメントの読み方",
      "### 節の索引",
      "| 節 | 中身 |",
      "| --- | --- |",
      "| #### 小節 | 中身 |",
      "",
      "索引のあとの一言。",
      "",
      "### 4.2 表示",
      "#### 小節",
    ].join("\n")

    expect(rewriteChildIndex(text)).toBe(
      ["# 題", "## このドキュメントの読み方", "### 4.2 表示", "#### 小節"].join("\n"),
    )
  })

  it("節の索引が最後の節なら、末尾の空行を1つ残して消す", () => {
    expect(rewriteChildIndex(["# 題", "", "## 甲", "", "## 節の索引", "| a |"].join("\n"))).toBe(
      ["# 題", "", "## 甲", ""].join("\n"),
    )
  })
})

describe("表の読み書き", () => {
  const text = [
    "## 見出し",
    "",
    "表は手で直さない。",
    "",
    "| 列1 | 列2 |",
    "| --- | --- |",
    "| a | b |",
    "",
    "後ろの文",
  ].join("\n")

  it("見出しと表のあいだに文があっても、行のセルを前後の空白なしで読む", () => {
    expect(readTableRows(text, "## 見出し")).toEqual([["a", "b"]])
  })

  it("3列の表も、列の数のまま読む", () => {
    const threeColumns = ["## 見出し", "| 甲 | 乙 | 丙 |", "| --- | --- | --- |", "| a | b | c |"]

    expect(readTableRows(threeColumns.join("\n"), "## 見出し")).toEqual([["a", "b", "c"]])
  })

  it("表を見出し行・区切り行ごと書き直し、前後の文は残す", () => {
    const replaced = replaceTable(text, "## 見出し", ["ファイル", "題", "節"], [["x", "y", "z"]])

    expect(replaced).toBe(
      [
        "## 見出し",
        "",
        "表は手で直さない。",
        "",
        "| ファイル | 題 | 節 |",
        "| --- | --- | --- |",
        "| x | y | z |",
        "",
        "後ろの文",
      ].join("\n"),
    )
  })
})
